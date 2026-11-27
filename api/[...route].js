"use strict";

const { handler } = require("../netlify/functions/api");

module.exports = async function inventoryApi(request, response) {
  const pathname = new URL(request.url || "/", "http://localhost").pathname;
  const route = pathname.replace(/^\/api\/?/, "");
  const body = request.body;
  const event = {
    httpMethod: request.method,
    queryStringParameters: { route },
    body: body == null ? null : typeof body === "string" ? body : JSON.stringify(body),
    isBase64Encoded: false
  };
  const result = await handler(event);

  response.statusCode = result.statusCode;
  for (const [name, value] of Object.entries(result.headers || {})) {
    response.setHeader(name, value);
  }
  response.end(result.body);
};
