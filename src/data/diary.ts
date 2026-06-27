// 日记数据配置
// 用于管理日记页面的数据

export interface DiaryItem {
	id: number;
	content: string;
	date: string;
	images?: string[];
	location?: string;
	mood?: string;
	tags?: string[];
}

// 日记数据（空，等待添加）
const diaryData: DiaryItem[] = [
	{
		id: 1,
		content: `今天把 agilepool 的可观测性这一块补齐了，给协程库加上了 Prometheus 监控和任务耗时采样支持。
				新增了内置的 Prometheus 指标，把池子的运行状态和任务各阶段的延迟都暴露出来；
				又顺手加了 WithSampleRate 配置项和 SetSampleRate 方法，上报比例可以随时调，生产环境就不用全量采集了。
				Context 里也实现了时间戳的自动传递，任务各阶段耗时不用再手动塞数据，框架自己会采。
				还写了个 Taker 小工具定时采池子状态，自定义回调留着以后扩展。
				测试用例也补齐了，示例程序重新过了一遍展示 Prometheus 集成的完整流程，go.mod 和 go.sum 也加上了 Prometheus 客户端依赖。
				不过没想到这用了我一天的时间，感觉我还是要继续提升自己的编码水平`,
		date: "2026-06-27T15:00:00Z",
	},
	{
		id: 2,
		content: `最近看项目里的代码、读别人写的设计文档，时常有种被远远甩在后面的感觉。

	每次遇到那些严格甚至苛刻的要求，第一反应总是——“我才大二啊，我怎么可能做得到”。

	但今天在跟朋友聊天的过程中，我突然意识到，这个念头本身，就是在给自己找借口。它像一张“免死金牌”，让我一遇到困难就习惯性地想往后缩。可别人不会因为我是大二就降低标准，企业也不会。如果我一直抱着“我还小所以做不到也正常”的心态，那我还怎么进步呢？

	承认自己暂时不行，不可怕。可怕的是一直觉得“暂时不行”是理所当然的，然后心安理得地待在舒适区里。

	强大的人不会为自己的弱小找借口。不行就是不行，承认它，然后去改进。`,
		date: "2026-06-25T15:35:00Z",
	},
];

// 获取日记列表（按时间倒序）
export const getDiaryList = (limit?: number) => {
	const sortedData = [...diaryData].sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	);

	if (limit && limit > 0) {
		return sortedData.slice(0, limit);
	}

	return sortedData;
};

// 获取所有标签
export const getAllTags = () => {
	const tags = new Set<string>();
	diaryData.forEach((item) => {
		if (item.tags) {
			item.tags.forEach((tag) => tags.add(tag));
		}
	});
	return Array.from(tags).sort();
};
