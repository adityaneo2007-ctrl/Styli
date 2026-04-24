# Deploy Styli to Vercel + GitHub — step by step

This is a no-command-line guide. You'll use GitHub's website and Vercel's website only. Total time: 10-12 minutes for the initial setup, 30 seconds for every future update.

You need:
- A GitHub account (you already have one — good)
- An email you can check (for Vercel signup)
- The `styli-platform` folder unzipped on your computer containing `index.html`, `vercel.json`, `README.md`, and `.gitignore`

---

## Part A — Put the code on GitHub

### Step A1 — Create a new repository

1. Log into GitHub.com.
2. Click the **+** in the top right, choose **New repository**.
3. Fill in:
   - **Repository name**: `styli-platform` (this becomes part of your Vercel URL)
   - **Description**: "Styli — AI fashion marketplace prototype"
   - Keep **Public** selected
   - Check **Add a README file** (we'll overwrite it)
   - Leave .gitignore and license as None
4. Click **Create repository**.

### Step A2 — Upload your files

1. On the new repo page, click **Add file** → **Upload files**.
2. Drag all four files from your `styli-platform` folder into the drop zone: `index.html`, `vercel.json`, `README.md`, `.gitignore`.
3. Scroll down. In the "Commit changes" section, write: "Initial Styli platform"
4. Leave "Commit directly to the main branch" selected.
5. Click the green **Commit changes** button.

If GitHub asks "are you sure you want to overwrite README.md" — yes, overwrite.

You should now see all four files in your repo. The README renders below them.

---

## Part B — Deploy with Vercel

### Step B1 — Sign up for Vercel

1. Open a new tab, go to https://vercel.com
2. Click **Sign Up** in the top right.
3. Choose **Continue with GitHub** (fastest — uses your existing account).
4. Authorize Vercel to access your GitHub. Review what it asks for — it needs access to your repositories to deploy them.
5. Vercel will ask you to pick a plan. Choose **Hobby** (the free tier). You don't need Pro for a prototype.

### Step B2 — Create a new project

1. On the Vercel dashboard, click **Add New...** → **Project**.
2. You'll see a list of your GitHub repositories. Find `styli-platform` and click **Import** next to it.
3. If you don't see it, click "Adjust GitHub App Permissions" and allow Vercel access to that specific repo.
4. On the configuration screen:
   - **Project Name**: leave as `styli-platform` (or change to `styli` for a shorter URL)
   - **Framework Preset**: Vercel should auto-detect "Other" — that's correct, this is a static site
   - **Root Directory**: leave as `./`
   - **Build and Output Settings**: expand this section and make sure everything is on defaults (no build command needed for a plain HTML file)
5. Click **Deploy**.

Vercel will take 30-60 seconds to deploy. You'll see a progress indicator.

### Step B3 — Your site is live

When deployment finishes, you'll see a celebration screen with a screenshot of your site and a URL like:

```
https://styli-platform.vercel.app
```

or

```
https://styli-platform-abc123.vercel.app
```

Click **Visit** to open your live deployment. Test it thoroughly on your phone and on your laptop.

---

## Part C — Future updates

This is the part that makes Vercel better than GitHub Pages. **Every time you push a change to GitHub, Vercel automatically deploys it.**

To update:

1. Go to your repo on GitHub.
2. Click on `index.html`.
3. Click the pencil icon (top right of the file view) to edit.
4. Paste the new code or make your changes.
5. Scroll down, enter a commit message like "Update product detail page", click **Commit changes**.
6. Within 30-60 seconds, your live URL shows the updated version.

Vercel tracks every deployment. If you break something, you can instantly roll back to a previous deployment from the Vercel dashboard.

---

## Part D — Custom domain (optional, when you're ready)

When you've validated the product name and want a real domain like `trystyli.com`:

1. Buy the domain from Namecheap, GoDaddy, or Google Domains (~₹800/year for a .com, ~₹500 for a .in).
2. In your Vercel project, go to **Settings** → **Domains**.
3. Enter your domain (e.g., `trystyli.com`). Vercel will show you DNS records to add.
4. Go to your domain registrar's dashboard, find DNS settings, add the records Vercel shows you.
5. Wait 10-30 minutes for DNS to propagate. Vercel will show a green check when it's ready.

Your platform is now live at your real domain with HTTPS automatically enabled.

---

## Common issues

**"I don't see my repo in Vercel's import list"**
Go to Vercel Settings → Git → GitHub → Configure. Grant access to `styli-platform` specifically, or "All repositories."

**"My deployment says 'Failed'"**
Click the deployment in Vercel dashboard to see logs. For a static HTML site, the most common issue is a missing `index.html` — make sure it's in the root of the repo, not in a subfolder.

**"The URL gives a 404"**
If your `index.html` is somewhere other than the root of the repo, Vercel can't find it. Move it to the root and push again.

**"Changes I pushed don't show up"**
1. Hard-refresh your browser (Ctrl+Shift+R on Windows, Cmd+Shift+R on Mac) to bypass cache.
2. Check the Vercel dashboard — is the latest deployment marked "Ready"? If it failed, read the error.
3. Old browser data (localStorage) persists across deploys. If you want a fresh state, click "Reset demo" in the banner.

**"I want to change my project URL"**
Vercel → project Settings → General → Project Name. Changing this updates the URL but invalidates old links. Do this early before sharing widely.

**"Can I make this private to only my team?"**
Vercel's Hobby plan only does public deployments. To password-protect or restrict access, you need Pro ($20/month). For pre-launch, public with "private URL sharing" (only you know the URL) is usually enough.

---

## After deployment

1. Test every flow: buyer signup → onboarding → shop → cart → checkout, vendor login → catalog → order processing, admin → applications → approvals.
2. Test on mobile (Chrome or Safari on your phone) — the buyer side is designed for it.
3. Share the URL with one person you trust and ask them to walk through all three roles without your guidance. Their confusion is your feedback.
4. Add the URL to your pitch deck, email signature, and team shared doc.

You're now running a real deployment pipeline. Every change you make propagates to the live site within a minute. This is how actual software companies work.
