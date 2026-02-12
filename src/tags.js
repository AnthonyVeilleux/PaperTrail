// src/tags.js
export function extractHashtags(text) {
  if (!text || typeof text !=="string") return { tags:{}, hierarchy: {} };

  const hashtagRegex =/#([a-zA-Z0-9_.-]+)/g;
  const tags ={};
  const hierarchy ={};

  let match;
  while ((match =hashtagRegex.exec(text)) !== null) {
    const tag =match[1];
    tags[tag] =(tags[tag] || 0) + 1;

    if (tag.includes(".")) {
      const parts =tag.split(".");
      for (let i =0; i< parts.length -1;i++) {
        const parent =parts.slice(0, i +1).join(".");
        const child =parts.slice(0, i +2).join(".");
        if (!hierarchy[parent]) hierarchy[parent] =[];
        if (!hierarchy[parent].includes(child)) hierarchy[parent].push(child);
      }
    }
  }

  return { tags, hierarchy };
}

