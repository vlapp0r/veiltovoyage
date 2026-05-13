const fs = require('fs');
const path = require('path');

// ── helpers ──────────────────────────────────────────────────────────────────

async function fetchUnsplash(query, count = 3) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) { console.warn('No UNSPLASH_ACCESS_KEY'); return []; }
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape&content_filter=high`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}` } });
  if (!res.ok) { console.warn('Unsplash error:', res.status); return []; }
  const data = await res.json();
  return (data.results || []).map(p => ({
    url: p.urls.regular,
    download_url: p.links.download_location,
    thumb: p.urls.thumb,
    alt: p.alt_description || query,
    credit: `Photo by ${p.user.name} on Unsplash`,
    credit_url: p.user.links.html + '?utm_source=veiltovoyage&utm_medium=referral',
    source: 'unsplash'
  }));
}

async function fetchPexels(query, count = 3) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) { console.warn('No PEXELS_API_KEY'); return []; }
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) { console.warn('Pexels error:', res.status); return []; }
  const data = await res.json();
  return (data.photos || []).map(p => ({
    url: p.src.large,
    thumb: p.src.medium,
    alt: p.alt || query,
    credit: `Photo by ${p.photographer} on Pexels`,
    credit_url: p.url,
    source: 'pexels'
  }));
}

async function downloadImage(imageUrl, destPath, downloadApiUrl) {
  // trigger Unsplash download tracking if needed
  if (downloadApiUrl && process.env.UNSPLASH_ACCESS_KEY) {
    await fetch(downloadApiUrl + `?client_id=${process.env.UNSPLASH_ACCESS_KEY}`).catch(() => {});
  }
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const buf = await res.arrayBuffer();
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, Buffer.from(buf));
}

// ── Claude: analyse post and plan image placement ────────────────────────────

async function planImages(postContent, postSlug) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: `You are an image placement assistant for a wedding and honeymoon blog called Veil to Voyage.
Given a blog post, you identify the best 3 places to insert images and suggest search queries for copyright-free stock photos.
Respond ONLY with valid JSON — no markdown, no explanation, just raw JSON.`,
      messages: [{
        role: 'user',
        content: `Analyse this blog post and identify exactly 3 good image placement spots.
For each spot, give:
1. The exact heading text (H2 ## heading) AFTER which the image should appear, or "INTRO" to place it after the first paragraph
2. A short, specific Unsplash/Pexels search query (4-6 words, very visual) that matches that section
3. A concise alt text for the image

Post content:
${postContent.slice(0, 3000)}

Respond with this exact JSON structure:
{
  "placements": [
    { "after": "INTRO", "query": "bride getting ready morning", "alt": "Bride getting ready on wedding morning" },
    { "after": "## exact heading text here", "query": "tropical beach honeymoon sunset", "alt": "Couple on tropical honeymoon beach" },
    { "after": "## another heading", "query": "wedding venue decoration flowers", "alt": "Elegant wedding venue with floral arrangements" }
  ]
}`
      }]
    })
  });

  const data = await res.json();
  if (!data.content || !data.content[0]) throw new Error('No Claude response');
  const text = data.content[0].text.trim();
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ── insert images into markdown ──────────────────────────────────────────────

function insertImagesIntoMarkdown(content, placements, imageMap) {
  let lines = content.split('\n');
  let result = [];
  let introInserted = false;
  let paragraphCount = 0;

  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    const line = lines[i].trim();

    // After INTRO — insert after second non-empty paragraph after front matter
    if (!introInserted && paragraphCount === 0 && line && !line.startsWith('#') && !line.startsWith('---') && !line.startsWith('*')) {
      paragraphCount++;
    } else if (!introInserted && paragraphCount === 1 && line === '') {
      const placement = placements.find(p => p.after === 'INTRO');
      if (placement && imageMap['INTRO']) {
        const img = imageMap['INTRO'];
        result.push('');
        result.push(`![${img.alt}](${img.mdPath})`);
        result.push(`*${img.credit}*`);
        result.push('');
        introInserted = true;
      }
      paragraphCount++;
    }

    // After H2 headings
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      const headingText = '## ' + headingMatch[1];
      const placement = placements.find(p =>
        p.after !== 'INTRO' &&
        headingText.toLowerCase().includes(p.after.replace(/^##\s*/, '').toLowerCase().slice(0, 20))
      );
      if (placement && imageMap[placement.after]) {
        const img = imageMap[placement.after];
        // Insert after the next non-empty paragraph following this heading
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        // Find end of that paragraph
        while (j < lines.length && lines[j].trim() !== '') j++;
        // We'll flag this heading for post-paragraph insertion
        result.push('__IMG_PLACEHOLDER__' + placement.after + '__');
      }
    }
  }

  // Second pass: replace placeholders
  let finalLines = [];
  for (const line of result) {
    if (line.startsWith('__IMG_PLACEHOLDER__')) {
      const key = line.replace('__IMG_PLACEHOLDER__', '').replace('__', '');
      const placement = placements.find(p => p.after === key);
      if (placement && imageMap[key]) {
        const img = imageMap[key];
        finalLines.push('');
        finalLines.push(`![${img.alt}](${img.mdPath})`);
        finalLines.push(`*${img.credit}*`);
        finalLines.push('');
      }
    } else {
      finalLines.push(line);
    }
  }

  return finalLines.join('\n');
}

// ── main ─────────────────────────────────────────────────────────────────────

async function run() {
  const targetPost = process.env.TARGET_POST; // filename or 'latest'
  const postsDir = 'content/posts';

  // Find the target post file
  let postFile;
  if (!targetPost || targetPost === 'latest') {
    const files = fs.readdirSync(postsDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();
    if (files.length === 0) { console.log('No posts found'); process.exit(0); }
    postFile = files[0];
  } else {
    postFile = fs.readdirSync(postsDir).find(f => f.includes(targetPost));
    if (!postFile) { console.error(`Post not found: ${targetPost}`); process.exit(1); }
  }

  const postPath = path.join(postsDir, postFile);
  const postSlug = postFile.replace('.md', '');
  console.log(`Adding images to: ${postFile}`);

  const content = fs.readFileSync(postPath, 'utf8');

  // Check if images already added
  if (content.includes('static/images/posts/' + postSlug)) {
    console.log('Images already added to this post. Skipping.');
    process.exit(0);
  }

  // Plan image placements with Claude
  console.log('Planning image placements with Claude...');
  const plan = await planImages(content, postSlug);
  console.log('Placements planned:', plan.placements.map(p => p.after));

  // Fetch images from Unsplash + Pexels
  const imageMap = {};
  const imgDir = `static/images/posts/${postSlug}`;
  fs.mkdirSync(imgDir, { recursive: true });

  for (let i = 0; i < plan.placements.length; i++) {
    const p = plan.placements[i];
    console.log(`Fetching images for: "${p.query}"`);

    // Try Unsplash first, fall back to Pexels
    let images = await fetchUnsplash(p.query, 2);
    if (images.length === 0) {
      console.log('Unsplash empty, trying Pexels...');
      images = await fetchPexels(p.query, 2);
    }
    // If still empty, try Pexels as second source anyway and pick best
    const pexelImages = await fetchPexels(p.query, 2);
    const allImages = [...images, ...pexelImages];

    if (allImages.length === 0) {
      console.warn(`No images found for query: ${p.query}`);
      continue;
    }

    // Pick first available image
    const chosen = allImages[0];
    const ext = chosen.source === 'pexels' ? 'jpg' : 'jpg';
    const filename = `image-${i + 1}.${ext}`;
    const localPath = path.join(imgDir, filename);
    const mdPath = `/images/posts/${postSlug}/${filename}`;

    console.log(`Downloading from ${chosen.source}: ${chosen.url.slice(0, 60)}...`);
    await downloadImage(chosen.url, localPath, chosen.download_url);
    console.log(`Saved: ${localPath}`);

    imageMap[p.after] = {
      alt: p.alt,
      credit: chosen.credit,
      creditUrl: chosen.credit_url,
      mdPath,
      localPath,
      source: chosen.source
    };
  }

  if (Object.keys(imageMap).length === 0) {
    console.error('No images downloaded. Check API keys.');
    process.exit(1);
  }

  // Insert images into markdown
  console.log('Inserting images into post...');
  const updated = insertImagesIntoMarkdown(content, plan.placements, imageMap);
  fs.writeFileSync(postPath, updated, 'utf8');
  console.log(`Updated: ${postPath}`);
  console.log(`Images added: ${Object.keys(imageMap).length}`);

  // Write summary for PR body
  const summary = {
    post: postFile,
    images: Object.entries(imageMap).map(([k, v]) => ({
      placement: k,
      source: v.source,
      credit: v.credit,
      path: v.mdPath
    }))
  };
  fs.writeFileSync('scripts/last-image-run.json', JSON.stringify(summary, null, 2));
}

run().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
