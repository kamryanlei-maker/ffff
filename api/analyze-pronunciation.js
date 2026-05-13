export default async function handler(req, res) {
  try {
    const apiKey = process.env.SPEECHACE_API_KEY;
    const endpoint = process.env.SPEECHACE_ENDPOINT || "https://api.speechace.co";

    if (!apiKey) {
      return res.status(500).json({ error: "Missing SPEECHACE_API_KEY" });
    }

    return res.status(200).json({
      message: "Vercel API is working.",
      endpoint,
      keyLoaded: true
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
