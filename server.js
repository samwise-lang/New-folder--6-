require("dotenv").config();

const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || "stockroom";
const collectionName = "inventory";
const inventoryId = "default";
const maxProducts = 10;
const categories = ["Electronics", "Textile", "Cleaning materials", "Furniture", "Footwear"];
const client = mongoUri ? new MongoClient(mongoUri) : null;

app.disable("x-powered-by");
app.use((request, response, next) => {
  const origin = request.get("Origin");
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === "OPTIONS") return response.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: "16kb" }));

function validateProduct(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Product details must be sent as an object." };
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const category = body.category;
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const units = body.units;

  if (!name || name.length > 80) return { error: "Name is required and must be 80 characters or fewer." };
  if (!categories.includes(category)) return { error: "Choose one of the available product categories." };
  if (!description || description.length > 240) return { error: "Description is required and must be 240 characters or fewer." };
  if (!Number.isInteger(units) || units < 0 || units > 1000000) {
    return { error: "Units must be a whole number between 0 and 1,000,000." };
  }

  return { product: { name, category, description, units } };
}

function getInventory(collection) {
  return collection.findOne({ _id: inventoryId }, { projection: { products: 1 } });
}

app.get("/", (request, response) => {
  response.sendFile(path.join(__dirname, "products.html"));
});

app.get("/api/health", (request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/products", async (request, response) => {
  const collection = request.app.locals.inventory;
  const inventory = await getInventory(collection);
  response.json({ products: inventory ? inventory.products : [], maxProducts });
});

app.post("/api/products", async (request, response) => {
  const validation = validateProduct(request.body);
  if (validation.error) return response.status(400).json({ error: validation.error });

  const product = {
    id: crypto.randomUUID(),
    ...validation.product,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const collection = request.app.locals.inventory;
  const result = await collection.updateOne(
    {
      _id: inventoryId,
      $expr: { $lt: [{ $size: "$products" }, maxProducts] }
    },
    { $push: { products: product } }
  );

  if (result.matchedCount === 0) {
    return response.status(409).json({ error: "Inventory limit reached. You can have up to 10 products." });
  }

  response.status(201).json({ product });
});

app.put("/api/products/:id", async (request, response) => {
  const validation = validateProduct(request.body);
  if (validation.error) return response.status(400).json({ error: validation.error });

  const collection = request.app.locals.inventory;
  const result = await collection.updateOne(
    { _id: inventoryId, "products.id": request.params.id },
    {
      $set: {
        "products.$.name": validation.product.name,
        "products.$.category": validation.product.category,
        "products.$.description": validation.product.description,
        "products.$.units": validation.product.units,
        "products.$.updatedAt": new Date()
      }
    }
  );

  if (result.matchedCount === 0) return response.status(404).json({ error: "Product not found." });

  const inventory = await getInventory(collection);
  const product = inventory.products.find((item) => item.id === request.params.id);
  response.json({ product });
});

app.use((error, request, response, next) => {
  console.error("Request failed:", error);
  if (response.headersSent) return next(error);

  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  response.status(status).json({
    error: status === 400 ? "Invalid request body." : "The server could not complete the request."
  });
});

// --- Vercel fix: connect to MongoDB only when a request comes in ---
let isConnected = false;

async function ensureDb() {
  if (!mongoUri) throw new Error("MONGODB_URI is required.");
  if (isConnected && app.locals.inventory) return;
  
  await client.connect();
  const database = client.db(databaseName);
  const collection = database.collection(collectionName);
  await collection.updateOne(
    { _id: inventoryId },
    { $setOnInsert: { products: [] } },
    { upsert: true }
  );
  app.locals.inventory = collection;
  isConnected = true;
}

// Run ensureDb before every /api request
app.use("/api", async (request, response, next) => {
  try {
    await ensureDb();
    next();
  } catch (error) {
    next(error);
  }
});

// For local testing only - Vercel will not use this
if (require.main === module) {
  ensureDb().then(() => {
    app.listen(port, host, () => {
      console.log(`Stockroom is ready at http://${host}:${port}`);
    });
  }).catch((error) => {
    console.error("Stockroom could not start:", error.message);
    process.exitCode = 1;
  });
}

module.exports = app;
