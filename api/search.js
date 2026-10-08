const { MongoClient } = require("mongodb");

const DATABASE_NAME = "telegram_bot";
const COLLECTION_NAME = "movies";

let cachedClient = null;
let cachedCollection = null;


async function getCollection() {

    if (cachedCollection) {
        return cachedCollection;
    }

    if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI is not configured");
    }

    if (!cachedClient) {

        cachedClient = new MongoClient(
            process.env.MONGODB_URI
        );

        await cachedClient.connect();
    }

    const db =
        cachedClient.db(DATABASE_NAME);

    cachedCollection =
        db.collection(COLLECTION_NAME);

    return cachedCollection;
}


function escapeRegex(value) {

    return value.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}


module.exports = async function handler(req, res) {

    try {

        const query =
            String(req.query.q || "").trim();

        const quality =
            String(req.query.quality || "").trim();

        const language =
            String(req.query.language || "").trim();

        let page =
            parseInt(req.query.page || "1", 10);

        let limit =
            parseInt(req.query.limit || "50", 10);


        if (!Number.isFinite(page) || page < 1) {
            page = 1;
        }

        if (!Number.isFinite(limit) || limit < 1) {
            limit = 50;
        }

        if (limit > 50) {
            limit = 50;
        }


        const conditions = [];


        /*
         * Main search:
         *
         * file_name
         * file_id
         * title
         */

        if (query) {

            const safeQuery =
                escapeRegex(query);

            const regex =
                new RegExp(
                    safeQuery,
                    "i"
                );

            conditions.push({
                $or: [
                    { file_name: regex },
                    { file_id: regex },
                    { title: regex }
                ]
            });
        }


        /*
         * Quality filter
         *
         * Searches filename/caption.
         */

        if (quality) {

            const safeQuality =
                escapeRegex(quality);

            const qualityRegex =
                new RegExp(
                    safeQuality,
                    "i"
                );

            conditions.push({
                $or: [
                    { file_name: qualityRegex },
                    { caption: qualityRegex }
                ]
            });
        }


        /*
         * Language filter
         *
         * Searches filename/caption.
         */

        if (language) {

            const safeLanguage =
                escapeRegex(language);

            const languageRegex =
                new RegExp(
                    safeLanguage,
                    "i"
                );

            conditions.push({
                $or: [
                    { file_name: languageRegex },
                    { caption: languageRegex }
                ]
            });
        }


        const filter =
            conditions.length > 0
                ? { $and: conditions }
                : {};


        const collection =
            await getCollection();


        /*
         * Get one extra result.
         *
         * This lets us determine whether
         * there are more results without
         * doing an expensive countDocuments().
         */

        const documents =
            await collection
                .find(
                    filter,
                    {
                        projection: {
                            _id: 0,
                            id: 1,
                            file_id: 1,
                            file_name: 1,
                            file_size: 1,
                            caption: 1,
                            source_chat_id: 1,
                            source_message_id: 1,
                            poster_url: 1,
                            rating: 1,
                            title: 1
                        }
                    }
                )
                .sort({
                    _id: -1
                })
                .skip(
                    (page - 1) * limit
                )
                .limit(
                    limit + 1
                )
                .toArray();


        const hasMore =
            documents.length > limit;


        if (hasMore) {
            documents.pop();
        }


        res.status(200).json({
            results: documents,
            page: page,
            limit: limit,
            hasMore: hasMore
        });


    } catch (error) {

        console.error(
            "MongoDB search error:",
            error
        );

        res.status(500).json({
            error: "Database search failed"
        });
    }
};
