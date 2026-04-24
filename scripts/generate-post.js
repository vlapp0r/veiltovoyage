const fs = require('fs');
const path = require('path');

const TOPICS = [
  { keyword: "ultimate wedding planning checklist 18 months", category: "Wedding Planning", affiliate: "Zola registry" },
  { keyword: "best honeymoon destinations under 3000", category: "Honeymoon Travel", affiliate: "Booking.com hotels" },
  { keyword: "zola vs the knot registry comparison", category: "Registry", affiliate: "Zola signup" },
  { keyword: "average wedding cost breakdown 2026", category: "Budget", affiliate: "budget template download" },
  { keyword: "honeymoon packing list tropical beach", category: "Honeymoon Travel", affiliate: "Amazon travel items" },
  { keyword: "all inclusive honeymoon resorts caribbean", category: "Honeymoon Travel", affiliate: "Booking.com resorts" },
  { keyword: "wedding registry alternatives honeymoon fund", category: "Registry", affiliate: "Honeyfund signup" },
  { keyword: "how to create a wedding website free", category: "Wedding Planning", affiliate: "WedSites signup" },
  { keyword: "destination wedding planning guide", category: "Wedding Planning", affiliate: "Booking.com venues" },
  { keyword: "best honeymoon resorts maldives", category: "Honeymoon Travel", affiliate: "Booking.com resorts" },
];

const SYSTEM = `You write for Veil to Voyage, a wedding and honeymoon planning blog.
Voice: warm, honest, practical — like advice from a well-organized friend.
Always write in Hugo Markdown with this EXACT front matter format at the top:
---
title: "Your Title Here"
date: YYYY-MM-DD
description: "150 char meta description here"
categories: ["Category Name"]
tags: ["tag1", "tag2", "tag3"]
draft: false
---
Then write the post body. Include:
- An engaging intro paragraph
- 4-6 sections with ## H2 headings
- Bullet lists where helpful
- A natural mention of an affiliate product with placeholder text: [AFFILIATE LINK]
- A FAQ section at the end with 4 questions and answers using ## Frequently asked questions
- A final CTA paragraph to download the free wedding checklist
Total length: 1,500-1,800 words.`;

async function run() {
  const usedFile = 'scripts/used-topics.json';
  const used = fs.existsSync(usedFile)
    ? JSON.parse(fs.readFileSync(usedFile, 'utf8'))
    : [];

  const next = TOPICS.find(t => !used.includes(t.keyword));
  if (!next) {
    console.log('All topics used — add more to the TOPICS array!');
    process.exit(0);
  }

  const today = new Date().toISOString().split('T')[0];
  console.log(`Generating post for: "${next.keyword}"`);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Write a blog post targeting this keyword: "${next.keyword}"\nCategory: ${next.category}\nAffiliate opportunity: ${next.affiliate}\nToday's date for front matter: ${today}`
      }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('API error:', res.status, err);
    process.exit(1);
  }

  const data = await res.json();
  console.log('API response type:', data.type);

  if (!data.content || data.content.length === 0) {
    console.error('No content in response:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const content = data.content[0].text;
  const slug = next.keyword
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  const filename = `${today}-${slug}.md`;
  const filepath = path.join('content', 'posts', filename);

  fs.mkdirSync(path.join('content', 'posts'), { recursive: true });
  fs.writeFileSync(filepath, content, 'utf8');
  console.log(`Written: ${filepath}`);

  used.push(next.keyword);
  fs.mkdirSync('scripts', { recursive: true });
  fs.writeFileSync(usedFile, JSON.stringify(used, null, 2), 'utf8');
  console.log(`Marked as used. ${TOPICS.length - used.length} topics remaining.`);
}

run().catch(e => {
  console.error('Unhandled error:', e.message);
  process.exit(1);
});
