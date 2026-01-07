# Edu-ICE Status Dashboard

A beautiful web-based dashboard to track task status across different subjects.

## 🚀 Quick Start

### Local Development

1. **Start the Python proxy** (to handle CORS):
   ```bash
   python3 local-proxy.py
   ```

2. **Open the dashboard**:
   - Open `index.html` in your browser
   - The dashboard will automatically use the local proxy

### Deploy to Vercel (Recommended - No npm needed!)

**Deploy via GitHub (Easiest - No CLI required)**

1. **Push to GitHub** (Choose one method):

   **Method A: Upload via GitHub Web Interface (Easiest - No git needed!)**
   - Go to your GitHub repository: https://github.com/abdulr-dev/edu-ice-status
   - Click "Add file" → "Upload files"
   - Drag and drop all your project files
   - Click "Commit changes"
   
   **Method B: Use Git with Personal Access Token**
   - If you get 403 error, you need a Personal Access Token:
     1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
     2. Generate new token with `repo` permissions
     3. Use token as password when pushing:
     ```bash
     git add .
     git commit -m "Initial commit"
     git push origin main
     # When prompted for password, use your Personal Access Token
     ```
   
   **Method C: Switch to SSH**
   ```bash
   git remote set-url origin git@github.com:abdulr-dev/edu-ice-status.git
   git push origin main
   ```

2. **Import to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Sign up/Login (free, can use GitHub account)
   - Click "Add New" → "Project"
   - Click "Import Git Repository"
   - Select your GitHub repository
   - Click "Import"

3. **Configure Project** (Vercel will auto-detect settings):
   - Framework Preset: "Other" (or leave as is)
   - Root Directory: `./` (default)
   - Build Command: (leave empty)
   - Output Directory: (leave empty)
   - Click "Deploy"

4. **Set Environment Variable** (IMPORTANT!):
   - After first deployment, go to your project dashboard
   - Click "Settings" → "Environment Variables"
   - Click "Add New"
   - **Name**: `AUTH_TOKEN`
   - **Value**: `token`
   - **Environment**: Select all (Production, Preview, Development)
   - Click "Save"

5. **Redeploy**:
   - Go to "Deployments" tab
   - Click the "..." menu on the latest deployment
   - Click "Redeploy"
   - Your dashboard will now work with the API!

**Done!** Your dashboard will be live at `https://your-project.vercel.app`

## 📋 Features

- **5 Status Tabs**: Unclaimed, In Progress, Pending Review, Reviewed, Rework
- **6 Subjects**: Maths, Physics, Biology, Chemistry, Hardware, Data Science
- **FormStage Tracking**: Track tasks by formStage (Codability, Ground Truth and ICE, Image Rubrics and Gemini)
- **Beautiful UI**: Modern, minimal design with smooth animations
- **Real-time Counts**: Automatic count updates as you navigate tabs
- **Pagination Support**: Automatically fetches all pages for complete data

## 🎨 Subjects Supported

- 📐 Maths
- ⚛️ Physics
- 🧬 Biology
- ⚗️ Chemistry
- 🔧 Hardware
- 💻 Data Science

## 📝 Configuration

All configuration is in `config.js`:
- `AUTH_TOKEN`: API authentication token
- `API_BASE_URL`: Base URL for the API
- `PROJECT_ID`: Project ID (640)
- `LOCAL_PROXY`: Local proxy URL for development

**Note**: For Vercel deployment, set `AUTH_TOKEN` as an environment variable in Vercel dashboard. The serverless function in `/api/proxy.js` will use it.

## 🔧 Troubleshooting

**CORS Errors:**
- For local development: Make sure `python3 local-proxy.py` is running
- For Vercel: The serverless function in `/api/proxy.js` handles CORS automatically

**API Errors:**
- Check that your `AUTH_TOKEN` environment variable is set in Vercel
- Verify the API endpoint is accessible
- Check browser console for detailed error messages

**Vercel Deployment Issues:**
- Make sure `AUTH_TOKEN` environment variable is set
- Check Vercel function logs in the dashboard
- Ensure `vercel.json` is properly configured

## 📁 Project Structure

```
edu-ice-status/
├── index.html          # Main HTML file
├── styles.css          # All styles
├── script.js           # Main JavaScript logic
├── config.js           # Configuration (token, URLs, etc.)
├── local-proxy.py      # Local CORS proxy (development only)
├── api/
│   └── proxy.js        # Vercel serverless function
├── vercel.json         # Vercel configuration
└── package.json        # Project metadata
```

## 🎯 How It Works

1. **Local Development**: Uses Python proxy (`local-proxy.py`) to handle CORS
2. **Vercel Production**: Uses serverless function (`/api/proxy.js`) to handle CORS
3. **Automatic Detection**: The dashboard automatically detects the environment and uses the appropriate proxy
