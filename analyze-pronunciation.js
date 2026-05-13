# Replace Your `api/analyze-pronunciation.js` With This

Delete everything inside `api/analyze-pronunciation.js` and paste this:

```js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.SPEECHACE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'Missing SPEECHACE_API_KEY'
      });
    }

    const response = await fetch(
      `https://api.speechace.com/api/scoring/text/v9/json?key=${encodeURIComponent(apiKey)}&dialect=en-us`,
      {
        method: 'POST'
      }
    );

    const rawText = await response.text();

    return res.status(200).json({
      success: true,
      raw: rawText
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
```

After pasting:

1. Commit changes
2. Wait for Vercel redeploy
3. Test again
4. Screenshot the new result
