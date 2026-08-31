---
title: sshbox：给远程虚拟机装上 WSL 式体验的 SSH 工具
published: 2026-09-01
description: 仿 WSL 的远程虚拟机 SSH 工具 sshbox：配置一次，run / push / pull / shell 一条命令完成远程执行与文件传输。完整讲解命令分发、配置管理、flag 覆盖、退出码透传、PTY 与 SFTP 递归的实现。
tags: [Go, SSH, SFTP, 命令行, WSL]
category: 项目
draft: false
---

> 由于习惯了 WSL 的使用方式，面对虚拟机时还得敲一长串 ssh / scp 的命令，感觉相当麻烦，于是做了这个仿 WSL 的小工具。

## 一、总体设计

整个工具围绕一个核心设计——**让远程操作和 wsl 一一对应**：

| 操作 | 等价于 | 作用 |
| --- | --- | --- |
| `sshbox run "cmd"` | `wsl -e bash -c` | 远程执行命令，输出与退出码透传 |
| `sshbox push/pull` | `\\wsl$\` 拖文件 | SFTP 递归上传/下载 |
| `sshbox` | `wsl` | 交互式远程 shell |

## 二、入口与命令分发

入口统一走 `realMain()` 返回退出码，`main` 里 `os.Exit(realMain())`，保证任何路径都有确定的退出码（`main.go`）：

```go
func main() {
	os.Exit(realMain())
}

func realMain() int {
	args, flags := parseFlags(os.Args[1:])

	// 读取配置文件；不存在则使用默认值，并记住 hasFile 以便提示
	cfg, err := loadConfig()
	hasFile := true
	switch {
	case err == nil:
	case errors.Is(err, os.ErrNotExist):
		hasFile = false
	default:
		fmt.Fprintln(os.Stderr, "sshbox:", err)
		return 1
	}
	applyFlags(cfg, flags)

	if len(args) == 0 {
		// 无参数 = 仿 wsl 的 shell；但尚未配置时先引导用户初始化
		if !hasFile {
			fmt.Fprintln(os.Stderr, "sshbox: 尚未创建配置,请先运行: sshbox --init")
			return 2
		}
		return dispatch(cfg, []string{"shell"})
	}

	switch args[0] {
	case "--init", "init":
		return cmdInit()                          // 交互式初始化
	case "set":
		return cmdSet(args[1:], cfg)
	case "get":
		return cmdGet(cfg)
	case "help", "--help", "-h":
		fmt.Print(usage)
		return 0
	case "run", "push", "pull", "shell":
		return dispatch(cfg, args)
	default:
		// 仿 wsl：裸参数（如 sshbox "uname -a"）也当作远程命令执行
		return dispatch(cfg, append([]string{"run"}, strings.Join(args, " ")))
	}
}

func dispatch(cfg *config, args []string) int {
	client, err := dial(cfg)
	if err != nil {
		fmt.Fprintln(os.Stderr, "sshbox: connect failed:", err)
		return 1
	}
	defer client.Close()

	switch args[0] {
	case "run":
		code, err := remoteRun(client, cfg, args[1:])
		if err != nil {
			fmt.Fprintln(os.Stderr, "sshbox:", err)
			return 1
		}
		return code          // 透传远程退出码
	case "push":
		if err := remotePush(client, cfg, args[1:]); err != nil {
			fmt.Fprintln(os.Stderr, "sshbox:", err)
			return 1
		}
		return 0
	case "pull":
		if err := remotePull(client, cfg, args[1:]); err != nil {
			fmt.Fprintln(os.Stderr, "sshbox:", err)
			return 1
		}
		return 0
	case "shell":
		if err := remoteShell(client, cfg); err != nil {
			fmt.Fprintln(os.Stderr, "sshbox:", err)
			return 1
		}
		return 0
	default:
		fmt.Fprintln(os.Stderr, "sshbox: unknown command:", args[0])
		return 2
	}
}
```

设计要点：

- **退出码编码约定**：0 = 成功，1 = 工具自身出错，2 = 用法错误——和远程命令的退出码区分开。
- **无参数行为**：有配置进 shell，没配置就引导 `--init`，把"新手提示"也设计进退出码里。
- 一个 SSH 连接在 `dispatch` 里建立一次，所有子命令复用，`defer client.Close()` 统一释放。

## 三、配置管理

配置固定放在**当前目录**的 `sshbox.json`（跟随工作目录，不写用户目录），也支持环境变量 `SSHBOX_CONFIG` 指定路径（`config.go`）：

```go
type config struct {
	Host string `json:"host"`
	User string `json:"user"`
	Pass string `json:"pass"`
	Port int    `json:"port"`
}

func configPath() (string, error) {
	if p := os.Getenv("SSHBOX_CONFIG"); p != "" {
		return p, nil
	}
	return "sshbox.json", nil
}

func loadConfig() (*config, error) {
	p, err := configPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return nil, err
	}
	var c config
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("解析 %s: %w", p, err)
	}
	if c.Port <= 0 || c.Port > 65535 {
		c.Port = 22          // 配置损坏时回退默认端口
	}
	return &c, nil
}
```

### 3.1 set 命令的字段校验

`set` 按配置项类型做不同的校验（`config.go`）：

```go
func (c *config) set(name, value string) error {
	switch name {
	case "host":
		if value == "" {
			return errors.New("host 不能为空")
		}
		c.Host = value
	case "user":
		if value == "" {
			return errors.New("user 不能为空")
		}
		c.User = value
	case "pass":
		c.Pass = value
	case "port":
		n, err := strconv.Atoi(value)
		if err != nil || n <= 0 || n > 65535 {
			return errors.New("port 必须是 1-65535 的整数")
		}
		c.Port = n
	default:
		return fmt.Errorf("未知配置项 %q,可用: %s", name, strings.Join(configKeyNames(), ", "))
	}
	return nil
}
```

每个配置项的元信息也集中管理：

```go
var configKeys = []configKey{
	{name: "host", desc: "目标 SSH 地址"},
	{name: "user", desc: "登录用户名"},
	{name: "pass", desc: "登录密码"},
	{name: "port", desc: "SSH 端口"},
}
```

## 四、建立 SSH 连接

```go
func dial(cfg *config) (*ssh.Client, error) {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	clientCfg := &ssh.ClientConfig{
		User:            cfg.User,
		Auth:            []ssh.AuthMethod{ssh.Password(cfg.Pass)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	}
	return ssh.Dial("tcp", addr, clientCfg)
}
```

**注意**：目前使用 `ssh.InsecureIgnoreHostKey()` 不做主机密钥校验——这个选择是刻意的：内网虚拟机的 IP 和角色固定可信，做严格校验反而每次要处理指纹变化；但面向公网时，应改成已知主机密钥白名单（改一处即可）。

## 五、run：远程执行与退出码透传

（`run.go`）——实现非常薄：SSH session 的 stdout/stderr/stdin 直接挂到本地进程，然后透传退出码：

```go
func remoteRun(client *ssh.Client, cfg *config, args []string) (int, error) {
	if len(args) == 0 {
		return 0, fmt.Errorf("run: 缺少远程命令")
	}
	cmd := strings.Join(args, " ")

	session, err := client.NewSession()
	if err != nil {
		return 1, err
	}
	defer session.Close()

	session.Stdout = os.Stdout
	session.Stderr = os.Stderr
	session.Stdin = os.Stdin

	if err := session.Run(cmd); err != nil {
		if exitErr, ok := err.(*ssh.ExitError); ok {
			return exitErr.ExitStatus(), nil   // 透传远程退出码
		}
		return 1, err
	}
	return 0, nil
}
```

`*ssh.ExitError` 直接携带远程退出状态，取出来原样返回——本地 shell 就能正确感知远程命令的成败，脚本里 `&&` 链、`if ($?)` 都按本地直觉工作。

## 六、shell：PTY 交互

交互式 shell 必须走 PTY 才有正常的终端体验——像是 vim、htop 这类需要 TTY 的程序，Ctrl+C 语义，退出后终端状态恢复（`shell.go`）：

```go
func remoteShell(client *ssh.Client, cfg *config) error {
	session, err := client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()

	// 请求远程 PTY：终端类型 + 行列 + 模式
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", 40, 120, modes); err != nil {
		return fmt.Errorf("request pty: %w", err)
	}

	in, err := session.StdinPipe()
	if err != nil {
		return err
	}
	out, err := session.StdoutPipe()
	if err != nil {
		return err
	}
	session.Stderr = os.Stderr

	if err := session.Shell(); err != nil {
		return err
	}

	// 本地终端进入 raw 模式（Windows 下经 x/term 映射到控制台模式），
	// 否则 Ctrl+C 会被本地控制台拦截而不是发给远程
	oldState, err := term.MakeRaw(int(os.Stdin.Fd()))
	if err == nil {
		defer func() { _ = term.Restore(int(os.Stdin.Fd()), oldState) }()
	}

	// 双向管道：本地 stdin → 远程，远程 stdout → 本地
	done := make(chan struct{})
	go func() {
		_, _ = io.Copy(in, os.Stdin)
		_ = in.Close()
		close(done)
	}()
	go func() {
		_, _ = io.Copy(os.Stdout, out)
	}()

	err = session.Wait()
	<-done
	return err
}
```

**本地终端先进入 raw 模式**（`term.MakeRaw`）。不做这一步的话，Ctrl+C 会被 Windows 控制台直接拦截，根本到不了远程；做完之后，按键字节原样通过管道发给远程 PTY，交互体验和本地 shell 一致。

## 七、push/pull：SFTP 递归传输

文件传输走 SFTP（SSH 内置通道，不用另开端口）。push 的入口判断目标是文件还是目录，目录则递归（`sftp.go`）：

```go
func remotePush(client *ssh.Client, cfg *config, args []string) error {
	if len(args) != 2 {
		return fmt.Errorf("push: 用法 push <本地> <远端目录>")
	}
	local, remoteDir := args[0], args[1]

	c, err := sftp.NewClient(client)
	if err != nil {
		return err
	}
	defer c.Close()

	if err := ensureRemoteDir(c, remoteDir); err != nil {
		return err
	}

	info, err := os.Stat(local)
	if err != nil {
		return err
	}
	if info.IsDir() {
		base := filepath.Base(local)
		return walkPush(c, local, path.Join(remoteDir, base))
	}
	return pushFile(c, local, path.Join(remoteDir, filepath.Base(local)))
}
```

递归上传用最朴素的深度优先：

```go
func walkPush(c *sftp.Client, localDir, remoteDir string) error {
	if err := ensureRemoteDir(c, remoteDir); err != nil {
		return err
	}
	entries, err := os.ReadDir(localDir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		local := filepath.Join(localDir, e.Name())
		remote := path.Join(remoteDir, e.Name())
		if e.IsDir() {
			if err := walkPush(c, local, remote); err != nil {
				return err
			}
			continue
		}
		if err := pushFile(c, local, remote); err != nil {
			return err
		}
	}
	return nil
}
```

注意一个容易踩的坑：**本地路径用 `filepath.Join`（`\`），远端路径用 `path.Join`（`/`）**——Windows 的路径分隔符和 SFTP 的标准路径不能混用。

单文件传输就是 `io.Copy` 加一行提示：

```go
func pushFile(c *sftp.Client, local, remote string) error {
	f, err := os.Open(local)
	if err != nil {
		return err
	}
	defer f.Close()

	out, err := c.Create(remote)
	if err != nil {
		return err
	}
	defer out.Close()

	n, err := io.Copy(out, f)
	if err != nil {
		return err
	}
	fmt.Printf("push: %s -> %s (%d bytes)\n", local, remote, n)
	return nil
}
```

`pull` 的方向正好反过来，用 `c.ReadDir` 列远端目录 + `os.MkdirAll` 建本地目录，结构对称。

## 八、其他

整个项目 6 个文件、几百行 Go 语言代码，希望对你有帮助。
