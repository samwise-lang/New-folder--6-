# Stockroom inventory

The inventory page and API store products in MongoDB Atlas. The product list starts empty. The five categories are predefined, and the API enforces a maximum of 10 products.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`).
4. In `.env`, set `MONGODB_URI` to the connection string from Atlas **Connect → Drivers** and set `MONGODB_DB` if you want a different database name. The server intentionally exits until `MONGODB_URI` is set.
5. In Atlas, create a database user with read/write access to the selected database and allow your current IP in the project's Network Access list.
6. Run `npm start`, then open `http://localhost:3000`.

Keep `.env` private. Do not put the Atlas URI in `products.html`, commit it, or send it in chat. `.env` is ignored by Git; configure the same values as environment variables when hosting.

## Preview with VS Code Live Server

Live Server serves the HTML but does not run the API. Start the backend with `npm start`, then open `products.html` with Live Server. For a localhost preview on ports 5500–5599, the page sends API requests to `http://127.0.0.1:3000`; the backend permits those local preview origins. Keep both servers running while using the page.

## Deploy on Netlify

1. Push this project to a GitHub repository and import that repository in Netlify.
2. Netlify uses `netlify.toml` to run `npm run build`, publish `dist`, and deploy the API function.
3. In the Netlify site settings, add `MONGODB_URI` and `MONGODB_DB` as environment variables, then trigger a deploy.
4. Configure MongoDB Atlas Network Access to allow connections from your Netlify function runtime.

The Netlify function handles the same API routes as the local server. Anyone who can reach the public site can view and change its inventory.

## Storage and API

The app uses one `inventory` collection and one bounded inventory document (`_id: "default"`). Its `products` array holds at most 10 products; each product has an ID, name, category, description, units, and timestamps. Keeping this small, always-read-together list in one document lets MongoDB enforce the cap atomically.

- `GET /api/products` retrieves the inventory.
- `POST /api/products` adds a product.
- `PUT /api/products/:id` edits a product.
- `GET /api/health` checks that the API is running.
