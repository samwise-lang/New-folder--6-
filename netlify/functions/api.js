"use strict";

const crypto = require("node:crypto");
const { MongoClient } = require("mongodb");

const inventoryId = "default";
const maxProducts = 10;
const categories = ["Electronics", "Textile", "Cleaning materials", "Furniture", "Footwear"];
let client;
let connection;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}

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

async function getInventoryCollection() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not configured.");

  if (!client) client = new MongoClient(mongoUri);
  if (!connection) {
    connection = client.connect().catch((error) => {
      connection = null;
      throw error;
    });
  }
  await connection;

  const database = client.db(process.env.MONGODB_DB || "stockroom");
  const collection = database.collection("inventory");
  await collection.updateOne(
    { _id: inventoryId },
    { $setOnInsert: { products: [] } },
    { upsert: true }
  );
  return collection;
}

function parseBody(event) {
  if (!event.body) return null;
  const body = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return JSON.parse(body);
}

async function handler(event) {
  const method = event.httpMethod;
  const route = (event.queryStringParameters && event.queryStringParameters.route) || "";

  if (method === "GET" && route === "health") {
    return jsonResponse(200, { status: "ok" });
  }

  try {
    const collection = await getInventoryCollection();

    if (method === "GET" && route === "products") {
      const inventory = await collection.findOne(
        { _id: inventoryId },
        { projection: { products: 1 } }
      );
      return jsonResponse(200, { products: inventory ? inventory.products : [], maxProducts });
    }

    if (method === "POST" && route === "products") {
      let body;
      try {
        body = parseBody(event);
      } catch (error) {
        return jsonResponse(400, { error: "Invalid request body." });
      }

      const validation = validateProduct(body);
      if (validation.error) return jsonResponse(400, { error: validation.error });

      const product = {
        id: crypto.randomUUID(),
        ...validation.product,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const result = await collection.updateOne(
        {
          _id: inventoryId,
          $expr: { $lt: [{ $size: "$products" }, maxProducts] }
        },
        { $push: { products: product } }
      );
      if (result.matchedCount === 0) {
        return jsonResponse(409, { error: "Inventory limit reached. You can have up to 10 products." });
      }
      return jsonResponse(201, { product });
    }

    const productRoute = route.match(/^products\/([^/]+)$/);
    if (method === "PUT" && productRoute) {
      let body;
      try {
        body = parseBody(event);
      } catch (error) {
        return jsonResponse(400, { error: "Invalid request body." });
      }

      const validation = validateProduct(body);
      if (validation.error) return jsonResponse(400, { error: validation.error });

      const result = await collection.updateOne(
        { _id: inventoryId, "products.id": decodeURIComponent(productRoute[1]) },
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
      if (result.matchedCount === 0) return jsonResponse(404, { error: "Product not found." });

      const inventory = await collection.findOne(
        { _id: inventoryId },
        { projection: { products: 1 } }
      );
      const product = inventory.products.find((item) => item.id === decodeURIComponent(productRoute[1]));
      return jsonResponse(200, { product });
    }

    return jsonResponse(404, { error: "Not found." });
  } catch (error) {
    console.error("Netlify inventory function failed:", error);
    return jsonResponse(500, { error: "The server could not complete the request." });
  }
}

exports.handler = handler;
