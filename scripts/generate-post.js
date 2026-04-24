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
];

const SYSTEM = `You write for Veil to Voyage, a wedding and honeymoon planning blog.
Voice: warm, honest, practical — like advice from a well-organized friend.
Always write in Hugo Markdown with this front matter at the top:
---
title: "Your Title Here"
date: YYYY-MM-DD
description: "150 char meta description"
categories: ["Category Name"]
tags: ["tag1", "tag2", "tag3"]
draft: true
---
Include: engaging intro, 4-6 H2 sections, bullet lists where helpful,
a natural mention of an affiliate product (use placeholder text [AFFILIATE LINK]),
and a FAQ section at the end with 4 questions and answers.
End with a CTA to download the free wedding checklist.`;

async function run() {
  const used = fs.existsSync('scripts/used-topics.json')
    ? JSON.parse(fs.readFileSync('scripts/used-topics.json'))
    : [];

  const next = TOPICS.find(t => !used.includes(t.keyword));
  if (!next) { console.log('All topics used!'); return; }

  const today = new Date().toISOString().split('T')[0];

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
      messages: [{ role: 'user', content:
        `Write a 1,800-word SEO blog post for this keyword: "${next.keyword}"\n` +
        `Category: ${next.category}\nAffiliate opportunity: ${next.affiliate}\n` +
        `Use today's date: ${today}`
      }]
    })
  });

  const data = await res.json();
  const content = data.content[0].text;
  const slug = next.keyword.replace(/[^a-z0-9]+/gi,'-').toLowerCase().slice(0,60);
  const file = path.join('content','posts',`${today}-${slug}.md`);
  fs.writeFileSync(file, content);

  used.push(next.keyword);
  fs.writeFileSync('scripts/used-topics.json', JSON.stringify(used, null, 2));
  console.log(`Written: ${file}`);
}

run().catch(e => { console.error(e); process.exit(1); });
