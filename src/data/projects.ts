// Project data configuration file
// Used to manage data for the project display page

export interface Project {
	id: string;
	title: string;
	description: string;
	image: string;
	category: "web" | "mobile" | "desktop" | "other";
	techStack: string[];
	status: "completed" | "in-progress" | "planned";
	liveDemo?: string;
	sourceCode?: string;
	visitUrl?: string;
	startDate: string;
	endDate?: string;
	featured?: boolean;
	tags?: string[];
	showImage?: boolean;
}

export const projectsData: Project[] = [
  {
    "id": "agilepool",
    "title": "agilePool",
    "description": "高性能 Go 协程池，基于滑动窗口统计实现自适应扩缩容、并发数控制、空闲协程复用和优雅退出",
    "image": "",
    "category": "other",
    "techStack": ["Go"],
    "status": "completed",
    "sourceCode": "https://github.com/Yiming1997/agilePool",
    "startDate": "2025-06-01",
    "endDate": "2026-06-18",
    "featured": true,
    "tags": ["Go", "并发", "开源库", "协程"],
    "showImage": false
  },
  {
    "id": "goblog-stardreamer",
    "title": "GoBlog（StarDreamerCyberNook）",
    "description": "基于 Gin + GORM + Redis + Elasticsearch 的博客/社区后端，集成 AI 内容审核、全文搜索、读写分离和定时任务",
    "image": "",
    "category": "web",
    "techStack": ["Go", "Gin", "GORM", "MySQL", "Redis", "Elasticsearch", "Docker"],
    "status": "completed",
    "sourceCode": "https://github.com/Bury-Lee/GoBlog-StarDreamerCyberNook",
    "startDate": "2025-09-01",
    "endDate": "2026-04-26",
    "featured": true,
    "tags": ["博客", "后端", "社区", "AI"],
    "showImage": false
  },
  {
    "id": "zhimu",
    "title": "ZhiMu（智幕）",
    "description": "Windows 端 AI 驱动直播弹幕助手 —— 实时截屏 → 发送给 LLM 分析 → 在桌面悬浮显示弹幕",
    "image": "",
    "category": "desktop",
    "techStack": ["Go", "AI/LLM", "Windows API"],
    "status": "in-progress",
    "sourceCode": "https://github.com/Bury-Lee/ZhiMu",
    "startDate": "2026-05-01",
    "featured": false,
    "tags": ["AI", "直播", "弹幕", "Windows"],
    "showImage": false
  },
  {
    "id": "autoops",
    "title": "AutoOps",
    "description": "AI 驱动的自动化运维工具，集成终端命令执行、智能日志分析和自动故障修复，采用双模型 AI 架构",
    "image": "",
    "category": "desktop",
    "techStack": ["Go", "AI/LLM", "SQLite", "MySQL", "PostgreSQL"],
    "status": "in-progress",
    "sourceCode": "https://github.com/Bury-Lee/AutoOps",
    "startDate": "2026-04-01",
    "featured": false,
    "tags": ["DevOps", "AI", "命令行", "自动化"],
    "showImage": false
  }
];

// Get project statistics
export const getProjectStats = () => {
	const total = projectsData.length;
	const completed = projectsData.filter(
		(p) => p.status === "completed",
	).length;
	const inProgress = projectsData.filter(
		(p) => p.status === "in-progress",
	).length;
	const planned = projectsData.filter((p) => p.status === "planned").length;

	return {
		total,
		byStatus: {
			completed,
			inProgress,
			planned,
		},
	};
};

// Get projects by category
export const getProjectsByCategory = (category?: string) => {
	if (!category || category === "all") {
		return projectsData;
	}
	return projectsData.filter((p) => p.category === category);
};

// Get featured projects
export const getFeaturedProjects = () => {
	return projectsData.filter((p) => p.featured);
};

// Get all tech stacks
export const getAllTechStack = () => {
	const techSet = new Set<string>();
	projectsData.forEach((project) => {
		project.techStack.forEach((tech) => {
			techSet.add(tech);
		});
	});
	return Array.from(techSet).sort();
};
