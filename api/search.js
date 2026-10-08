const { MongoClient } = require("mongodb");

const DATABASE_NAME = "telegram_bot";
const COLLECTION_NAME = "movies";

let clientPromise = null;

function getCollection() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    clientPromise = client.connect().catch((err) => {
      clientPromise = null; // allow retry on next request
      throw err;
    });
  }
  return clientPromise.then((c) =>
    c.db(DATABASE_NAME).collection(COLLECTION_NAME)
  );
}

function rx(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

module.exports = async function handler(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const quality = String(req.query.quality || "").trim();
    const language = String(req.query.language || "").trim();

    let page = parseInt(req.query.page || "1", 10);
    let limit = parseInt(req.query.limit || "50", 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (!Number.isFinite(limit) || limit < 1 || limit > 50) limit = 50;

    const conditions = [];
    if (q) {
      const r = rx(q);
      conditions.push({
        $or: [{ file_name: r }, { title: r }, { file_id: r }],
      });
    }
    if (quality) {
      const r = rx(quality);
      conditions.push({ $or: [{ file_name: r }, { caption: r }] });
    }
    if (language) {
      const r = rx(language);
      conditions.push({ $or: [{ file_name: r }, { caption: r }] });
    }
    const filter = conditions.length ? { $and: conditions } : {};

    const collection = await getCollection();

    const documents = await collection
      .find(filter, {
        projection: {
          _id: 0, id: 1, file_id: 1, file_name: 1, file_size: 1,
          caption: 1, source_chat_id: 1, source_message_id: 1,
          poster_url: 1, rating: 1, title: 1,
        },
        maxTimeMS: 8000,
      })
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .toArray();

    const hasMore = documents.length > limit;
    if (hasMore) documents.pop();

    res.status(200).json({ results: documents, page, limit, hasMore });
  } catch (error) {
    console.error("===== MONGODB ERROR =====");
    console.error("Name:", error?.name);
    console.error("Message:", error?.message);
    console.error("Code:", error?.code);
    console.error("CodeName:", error?.codeName);
    console.error("=========================");
    // TEMPORARY diagnostics - remove "type" and "message" once fixed
    res.status(500).json({
      error: "Database search failed",
      type: error?.name,
      message: String(error?.message || "")
        .replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, "mongodb://***")
        .slice(0, 300),
    });
  }
};
