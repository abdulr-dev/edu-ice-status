// Vercel serverless function to proxy API requests
// This handles CORS and custom headers
// File location: /api/proxy.js

module.exports = async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.query;

    if (!url) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    try {
        // Decode the URL
        const apiUrl = decodeURIComponent(url);

        // Get auth token from request header first, then environment variable, then default
        const authHeader = req.headers.authorization || req.headers.Authorization;
        const AUTH_TOKEN = authHeader ? authHeader.replace('Bearer ', '') : (process.env.AUTH_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFiZHVsLnJAdHVyaW5nLmNvbSIsInN1YiI6OTk3LCJpYXQiOjE3Njc3MDc3NTYsImV4cCI6MTc2ODMxMjU1Nn0.bRF6Ph852jnKAgDBNbIBltJe-QWVid1Z-GKAS5E3_jQ');

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'authorization': `Bearer ${AUTH_TOKEN}`,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'DNT': '1',
                'x-app-version': '9c76935'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(response.status).json({ error: `API error: ${response.status}`, details: errorText });
        }

        const data = await response.json();

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Content-Type', 'application/json');

        return res.status(200).json(data);
    } catch (error) {
        console.error('Proxy error:', error);
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(500).json({ error: error.message, type: error.name });
    }
};