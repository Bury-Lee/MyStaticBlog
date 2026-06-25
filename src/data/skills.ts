// Skill data configuration file
// Used to manage data for the skill display page

export interface Skill {
	id: string;
	name: string;
	description: string;
	icon: string; // Iconify icon name
	category: "frontend" | "backend" | "database" | "tools" | "other";
	level: "beginner" | "intermediate" | "advanced" | "expert";
	experience: {
		years: number;
		months: number;
	};
	projects?: string[]; // Related project IDs
	certifications?: string[];
	color?: string; // Skill card theme color
}

export const skillsData: Skill[] = [
// ========== 编程语言 ==========
	{
	"id": "python",
	"name": "Python",
	"description": "通用编程语言，适用于Web开发、数据分析、机器学习等",
	"icon": "logos:python",
	"category": "backend",
	"level": "intermediate",
	"experience": { "years": 1, "months": 0 },
	"color": "#3776AB"
	},
	{
	"id": "java",
	"name": "Java",
	"description": "企业级应用开发的主流编程语言，跨平台、面向对象",
	"icon": "logos:java",
	"category": "backend",
	"level": "beginner",
	"experience": { "years": 0, "months": 4 },
	"color": "#ED8B00"
	},
	{
	"id": "go",
	"name": "Go",
	"description": "Google开发的高效编程语言，适用于云原生和微服务开发",
	"icon": "logos:go",
	"category": "backend",
	"level": "expert",
	"experience": { "years": 2, "months": 0 },
	"color": "#00ADD8"
	},
	{
	"id": "rust",
	"name": "Rust",
	"description": "注重安全、速度和并发的系统级编程语言，无垃圾回收",
	"icon": "logos:rust",
	"category": "backend",
	"level": "intermediate",
	"experience": { "years": 0, "months": 6 },
	"color": "#CE422B"
	},
	{
	"id": "cpp",
	"name": "C++",
	"description": "高性能系统级编程语言，广泛应用于游戏开发、系统软件和嵌入式开发",
	"icon": "logos:c-plusplus",
	"category": "backend",
	"level": "beginner",
	"experience": { "years": 0, "months": 3 },
	"color": "#00599C"
	},
	{
	"id": "c",
	"name": "C",
	"description": "底层系统编程语言，操作系统和嵌入式系统开发的基础",
	"icon": "logos:c",
	"category": "backend",
	"level": "intermediate",
	"experience": { "years": 0, "months": 5 },
	"color": "#A8B9CC"
	},

	// ========== 数据库 ==========
	{
	"id": "mysql",
	"name": "MySQL",
	"description": "全球最流行的开源关系型数据库管理系统，广泛应用于Web应用",
	"icon": "logos:mysql-icon",
	"category": "database",
	"level": "intermediate",
	"experience": { "years": 0, "months": 6 },
	"color": "#4479A1"
	},
	{
	"id": "postgresql",
	"name": "PostgreSQL",
	"description": "功能强大的开源关系型数据库管理系统",
	"icon": "logos:postgresql",
	"category": "database",
	"level": "intermediate",
	"experience": { "years": 0, "months": 3 },
	"color": "#336791"
	},
	{
	"id": "redis",
	"name": "Redis",
	"description": "高性能内存数据结构存储，用作数据库、缓存和消息队列",
	"icon": "logos:redis",
	"category": "database",
	"level": "beginner",
	"experience": { "years": 0, "months": 2 },
	"color": "#DC382D"
	},
	{
	"id": "sqlite",
	"name": "SQLite",
	"description": "轻量级嵌入式关系型数据库，适用于移动应用和小型项目",
	"icon": "simple-icons:sqlite",
	"category": "database",
	"level": "intermediate",
	"experience": { "years": 0, "months": 4 },
	"color": "#003B57"
	},

	// ========== 工具 ==========
	{
	"id": "git",
	"name": "Git",
	"description": "分布式版本控制系统，代码管理和团队协作的必备工具",
	"icon": "logos:git-icon",
	"category": "tools",
	"level": "intermediate",
	"experience": { "years": 2, "months": 0 },
	"color": "#F05032"
	},
	{
	"id": "vscode",
	"name": "VS Code",
	"description": "轻量但强大的代码编辑器，拥有丰富的插件生态",
	"icon": "logos:visual-studio-code",
	"category": "tools",
	"level": "intermediate",
	"experience": { "years": 3, "months": 0 },
	"color": "#007ACC"
	},
	{
	"id": "pycharm",
	"name": "PyCharm",
	"description": "JetBrains出品的专业Python IDE，提供智能代码分析和调试功能",
	"icon": "logos:pycharm",
	"category": "tools",
	"level": "intermediate",
	"experience": { "years": 1, "months": 0 },
	"color": "#21D789"
	},
	{
	"id": "docker",
	"name": "Docker",
	"description": "容器化平台，简化应用部署和环境管理",
	"icon": "logos:docker-icon",
	"category": "tools",
	"level": "beginner",
	"experience": { "years": 0, "months": 2 },
	"color": "#2496ED"
	},
	{
	"id": "linux",
	"name": "Linux",
	"description": "开源操作系统，服务器部署和开发环境的首选",
	"icon": "logos:linux-tux",
	"category": "tools",
	"level": "beginner",
	"experience": { "years": 0, "months": 6 },
	"color": "#FCC624"
	},

	// ========== 其他 ==========
	{
	"id": "elasticsearch",
	"name": "Elasticsearch",
	"description": "分布式搜索和分析引擎，用于全文搜索和数据分析",
	"icon": "logos:elasticsearch",
	"category": "other",
	"level": "beginner",
	"experience": { "years": 0, "months": 1 },
	"color": "#005571"
	}
]