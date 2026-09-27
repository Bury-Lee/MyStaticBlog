// 友情链接数据配置
// 用于管理友情链接页面的数据

export interface FriendItem {
	id: number;
	title: string;
	imgurl: string;
	desc: string;
	siteurl: string;
	tags: string[];
}

// 友情链接数据（空，等待添加）
export const friendsData: FriendItem[] = [
	{
		id: 1,
		title: "麦芽唐",
		imgurl: "https://myt.lcatl.cn/images/avatar.png",
		desc: "第47日份麦芽唐 | 学生 | 小画师",
		siteurl: "https://myt.lcatl.cn/",
		tags: ["画师", "艺术创作"],
	},
	{
		id: 2,
		title: "第二个麦芽唐",
		imgurl: "https://myt.stardreamer.cloud/images/avatar.png",
		desc: "第47日份麦芽唐 | 小画师主页(自建)",
		siteurl: "https://myt.stardreamer.cloud",
		tags: ["画师", "画册"],
	},
	{
		id: 3,
		title: "agilePool 官网",
		imgurl: "https://agilepool.stardreamer.cloud/logo.jpg",
		desc: "高性能 Go 协程池 · 官方文档站",
		siteurl: "https://agilepool.stardreamer.cloud",
		tags: ["Go", "开源项目"],
	},
	{
		id: 4,
		title: "星梦的赛博小屋 · GoBlog",
		imgurl: "https://blog.stardreamer.cloud/favicon.svg",
		desc: "基于 GoBlog 的技术分享与内容社区",
		siteurl: "https://blog.stardreamer.cloud",
		tags: ["博客", "技术社区"],
	},
	{
		id: 5,
		title: "Fhc1m Blog",
		imgurl: "https://fhc1m.com/favicon.svg",
		desc: "Fhc1m 的个人博客 · Java 后端 / 项目复盘 / AI Agent 实验",
		siteurl: "https://fhc1m.com/",
		tags: ["博客", "Java", "AI"],
	},
	{
		id: 6,
		title: "PAVILION_CAT",
		imgurl: "https://lcatl.cn/logo.png",
		desc: "猫猫的自留地 · 个人业务导航站",
		siteurl: "https://lcatl.cn/",
		tags: ["导航站", "工具"],
	},
	{
		id: 7,
		title: "Fhc1m的抖音",
		imgurl: "/douyin.png",
		desc: "抖音主页",
		siteurl: "https://v.douyin.com/mL_6csGCJXc/",
		tags: ["抖音"],
	},
];

// 获取所有友情链接数据
export function getFriendsList(): FriendItem[] {
	return friendsData;
}

// 获取随机排序的友情链接数据
export function getShuffledFriendsList(): FriendItem[] {
	const shuffled = [...friendsData];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}
