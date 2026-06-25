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
