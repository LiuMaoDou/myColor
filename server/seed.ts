import { asActor } from "@/lib/database";
import { saveResource } from "./resources";
const palettes = [
  [
    "深蓝学术",
    "Academic blue",
    "学术与教育",
    "学术,专业,冷静",
    "#F7FAFC #14213D #245B91 #DCEAF7 #E5A43B",
  ],
  [
    "克制学术绿",
    "Academic green",
    "学术与教育",
    "学术,自然,清新",
    "#F6F8F5 #213E38 #327A67 #D6E7DE #D59B55",
  ],
  [
    "灰蓝文献风",
    "Literature blue",
    "学术与教育",
    "文献,学术,理性",
    "#F3F5F8 #222E3D #516D8E #DCE4EE #B37F5A",
  ],
  [
    "阳光教育",
    "Sunny education",
    "学术与教育",
    "教育,明亮,蓝绿",
    "#FFF9F0 #173D50 #287F83 #D9EEE5 #F2B84B",
  ],
  [
    "活力课堂",
    "Lively classroom",
    "学术与教育",
    "教育,活力,现代",
    "#FFFDF9 #2C3557 #4267A8 #E8EFFC #EE8C68",
  ],
  [
    "柔和马卡龙",
    "Soft macaron",
    "设计风格",
    "低饱和,温柔,柔和",
    "#FBF7F4 #3F3F57 #90649E #EBDDED #D98672",
  ],
  [
    "科技蓝白",
    "Technology blue",
    "科技与商务",
    "科技,简洁,蓝绿",
    "#FFFFFF #17273C #1D64B4 #EAF2FB #008E95",
  ],
  [
    "红灰商务",
    "Business red",
    "科技与商务",
    "商务,稳重,红灰",
    "#FFFFFF #222832 #B91D2B #F0F1F3 #61748B",
  ],
  [
    "AI 深空",
    "AI deep space",
    "科技与商务",
    "AI,深色,科技",
    "#0D172A #F3F7FA #5CACEA #1F3550 #64E4C0",
  ],
  [
    "瑞士极简",
    "Swiss minimal",
    "设计风格",
    "极简,设计,低饱和",
    "#F8F7F3 #212121 #BD4C3A #E5E3DC #858B6E",
  ],
  [
    "东方雅色",
    "Eastern elegance",
    "设计风格",
    "传统,东方,温暖",
    "#F8F2E9 #302F2D #875948 #EAD8BA #2F6F66",
  ],
  [
    "数据蓝橙",
    "Data blue orange",
    "学术与教育",
    "图表,科研,对比",
    "#FFFFFF #1F2937 #0072B2 #DDEAF4 #D97706",
  ],
];
const sites = [
  ["Color Hunt", "https://colorhunt.co/", "色板灵感与风格标签", "配色灵感"],
  ["Coolors", "https://coolors.co/", "配色生成与组合探索", "配色生成"],
  [
    "Adobe Color",
    "https://color.adobe.com/create/color-wheel",
    "色轮与和谐关系",
    "色彩理论",
  ],
  [
    "Happy Hues",
    "https://www.happyhues.co/",
    "查看颜色在页面中的语义角色",
    "产品界面",
  ],
  [
    "Realtime Colors",
    "https://www.realtimecolors.com/",
    "在真实页面结构中查看配色",
    "产品界面",
  ],
  ["Huemint", "https://huemint.com/", "面向品牌与网页的配色探索", "配色生成"],
  ["Khroma", "https://www.khroma.co/", "基于偏好的配色发现", "配色灵感"],
  ["Muzli Colors", "https://colors.muz.li/", "颜色搜索与场景灵感", "配色灵感"],
  ["ColorSpace", "https://mycolor.space/", "主色扩展与渐变参考", "配色生成"],
  [
    "Canva Palette Generator",
    "https://www.canva.com/colors/color-palette-generator/",
    "从图片探索候选色",
    "图片取色",
  ],
  [
    "ColorBrewer",
    "https://colorbrewer2.org/",
    "顺序、发散与分类图表配色",
    "科研图表",
  ],
  [
    "Radix Colors",
    "https://www.radix-ui.com/colors",
    "界面状态与系统化色阶",
    "产品界面",
  ],
  [
    "WebAIM Contrast Checker",
    "https://webaim.org/resources/contrastchecker/",
    "文字与背景对比度检测",
    "可访问性",
  ],
  ["中国色", "https://zhongguose.com/", "中国传统色名称与色值索引", "传统文化"],
  ["Nippon Colors", "https://nipponcolors.com/", "日本传统色参考", "传统文化"],
];
export async function seed(owner: string) {
  await asActor(owner, async (tx) => {
    const [done] =
      await tx`SELECT id FROM resources WHERE owner_id=${owner} AND source_kind='plan-seed' LIMIT 1`;
    if (done) return;
    const cats: Record<string, string> = {};
    for (const [name, slug] of [
      ["学术与教育", "education"],
      ["科技与商务", "business"],
      ["设计风格", "design"],
      ["颜色工具与知识", "tools"],
    ]) {
      const [c] =
        await tx`INSERT INTO categories(owner_id,name,slug) VALUES(${owner},${name},${slug}) ON CONFLICT(owner_id,slug) DO UPDATE SET name=excluded.name RETURNING id`;
      cats[name] = String(c.id);
    }
    const all: string[] = [];
    for (const [i, p] of palettes.entries()) {
      const r = await saveResource(tx, owner, {
        type: "palette",
        title: p[0],
        aliases: [p[1]],
        description:
          "场景化配色建议，可用于 PPT、教学、网页或科研图表。请根据实际前景与背景组合检查对比度。",
        colors: p[4].split(" ").map((input, j) => ({
          input,
          role: ["background", "text", "primary", "muted", "accent"][j],
        })),
        categoryIds: [cats[p[2]]],
        tags: p[3].split(","),
        sourceKind: "plan-seed",
        sourceMetadata: {
          legacyId: `palette-${i + 1}`,
          credit:
            "来自用户提供的 Color Atlas 开发计划，第 23 节；不是第三方网站的官方方案。",
        },
      });
      all.push(r.id);
      await tx`UPDATE resources SET created_at=now()-(${i}*interval '1 second'),updated_at=now()-(${i}*interval '1 second') WHERE id=${r.id}`;
    }
    for (const [i, s] of sites.entries()) {
      const r = await saveResource(tx, owner, {
        type: "website",
        title: s[0],
        url: s[1],
        description: s[2],
        tags: [s[3]],
        categoryIds: [cats["颜色工具与知识"]],
        colors: [],
        sourceUrl: s[1],
        sourceKind: "plan-seed",
        sourceMetadata: {
          legacyId: `site-${i + 1}`,
          credit:
            "用户提供的计划中的官网书签；用途说明不代表价格或可用性保证。",
        },
      });
      all.push(r.id);
      await tx`UPDATE resources SET created_at=now()-(${i + 20}*interval '1 second'),updated_at=now()-(${i + 20}*interval '1 second') WHERE id=${r.id}`;
    }
    for (const [name, ids] of [
      ["学术与教育", all.slice(0, 5)],
      ["科技商务", all.slice(6, 9)],
      ["网页配色工具", all.slice(12)],
    ] as [string, string[]][]) {
      const [c] =
        await tx`INSERT INTO collections(owner_id,name) VALUES(${owner},${name}) RETURNING id`;
      for (const [i, id] of ids.entries())
        await tx`INSERT INTO collection_items(collection_id,resource_id,position) VALUES(${c.id},${id},${i})`;
    }
  });
}
