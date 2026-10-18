# 线程撕裂者 Linux 客户端版

给 Linux 上的哔哩哔哩客户端（[msojocs/bilibili-linux](https://github.com/msojocs/bilibili-linux)，AUR 包 `bilibili-bin`）加上线程撕裂者（BTR）的多线程、多 CDN 下载。

- 播放、弹幕、字幕、清晰度菜单仍由客户端自己负责，BTR 只接管视频下载，相当于网页版的兼容模式
- BTR 是一个单独的 pacman 包（`bilibili-thread-ripper-linux-git`），不替换、不重新打包客户端
- 打补丁、更新、恢复都由 pacman 钩子自动完成，一次 `paru` 同时更新客户端和 BTR

## 安装

前提：已经装好 `bilibili-bin`（`paru -S bilibili-bin`），并且用 paru。

**1. 把打包脚本克隆到本地**

```bash
git clone -b linux-desktop https://github.com/hjy1/Bilibili-thread-ripper.git ~/.local/share/btr-pkgbuild
```

**2. 告诉 paru 这里有一个 PKGBUILD 仓库**

```bash
grep -q '^\[btr\]' /etc/paru.conf || printf '\n[btr]\nPath = %s\n' "$HOME/.local/share/btr-pkgbuild/linux" | sudo tee -a /etc/paru.conf
```

**3. 确认 paru 会检查 git 包的更新**：`/etc/paru.conf` 的 `[options]` 里要有一行没被注释的 `Devel`（paru 默认就有）。

```bash
grep -n '^Devel' /etc/paru.conf
```

**4. 安装**

```bash
paru -S bilibili-thread-ripper-linux-git
```

安装时会看到 `Applying Bilibili Thread Ripper to the bilibili client...`，说明补丁已经打上。

**5. 完全退出客户端，再从应用菜单重新打开**

## 确认它在工作

```bash
/usr/lib/bilibili-thread-ripper/btr-patch status
```

输出里是 `"state":"current"` 就说明客户端已经打上当前版本的补丁。在客户端里：

- 设置页左边多了“线程撕裂者”一栏，可以改 CDN 模式和线程数
- 播放器 ⚙ → 更多播放设置 里也有 CDN 和线程数
- BTR 平时不弹提示。想看它在干什么，在设置里勾选“Debug 模式”，播放时视频上会出现下载提示

## 更新是怎么进行的

平时只需要运行 `paru`。客户端和 BTR 是两个互相独立的包，各自有版本、各自更新，更新一个**不会**更新或重新构建另一个：

| 包 | 什么时候有更新 | 更新从哪里来 |
|---|---|---|
| `bilibili-bin` | AUR 维护者发布新版 | AUR |
| `bilibili-thread-ripper-linux-git` | `linux-desktop` 分支有新提交 | GitHub，paru 的 Devel 检查 |

两者之间只有一个联系——pacman 钩子。它只**重新打补丁**，不更新任何东西：

| 发生了什么 | 钩子做什么 |
|---|---|
| `bilibili-bin` 升级 | pacman 先装上干净的新 `app.asar`，钩子再用**已经装着的** BTR 给它打补丁 |
| BTR 升级 | 钩子用保存的原始文件，给**现在的**客户端重新打补丁 |
| 卸载 BTR | 钩子把官方 `app.asar` 原样放回去 |
| 卸载客户端 | 钩子删掉不再需要的原始文件备份 |

补充说明：

- 客户端的原始 `app.asar` 保存在 `/var/lib/bilibili-thread-ripper/`（约 170 MB），卸载 BTR 时用它恢复
- PKGBUILD 本身很少改；真改了的时候，运行 `git -C ~/.local/share/btr-pkgbuild pull` 让 paru 看到新的打包脚本
- 新版客户端如果改了程序结构、BTR 认不出来，钩子会报 `unsupported-client`，**不修改**客户端：客户端照常能用，只是暂时没有加速，等 BTR 更新

## 卸载

```bash
sudo pacman -R bilibili-thread-ripper-linux-git    # 只卸载 BTR，恢复官方客户端
```

BTR 依赖客户端，所以单独 `sudo pacman -R bilibili-bin` 会被拒绝。要连客户端一起卸载：

```bash
sudo pacman -R bilibili-bin bilibili-thread-ripper-linux-git
```

想彻底清理，再删掉 `/etc/paru.conf` 里的 `[btr]` 两行和 `~/.local/share/btr-pkgbuild`。

## 出问题时

| 情况 | 怎么办 |
|---|---|
| 客户端里看不到“线程撕裂者” | 先完全退出客户端再打开；再看 `btr-patch status` 是不是 `current` |
| `btr-patch status` 是 `not-patched` 或 `outdated` | `sudo /usr/lib/bilibili-thread-ripper/btr-patch patch` |
| 钩子报 `unsupported-client` | 客户端结构变了，BTR 需要更新；客户端本身不受影响 |
| 补丁出错、想要干净的客户端 | `paru -S bilibili-bin` 重装客户端，钩子会重新打补丁；不想要 BTR 就先卸载它 |
| `pacman -Qkk bilibili-bin` 报告 `app.asar` 被修改 | 正常，这就是补丁 |

反馈问题时请附上 `btr-patch status` 的输出、客户端版本（`pacman -Q bilibili-bin`），以及打开 Debug 模式后看到的提示。

## 只装一次、不要自动更新

```bash
git clone -b linux-desktop https://github.com/hjy1/Bilibili-thread-ripper.git
cd Bilibili-thread-ripper/linux
makepkg -si
```

以后要更新，就在同一个目录里 `git pull` 后再运行 `makepkg -si`。客户端升级后的重新打补丁仍然是自动的。

## 开发

| 文件 | 作用 |
|---|---|
| `adapter/` | 客户端适配层：接管播放窗口里的 `fetch` / `XMLHttpRequest`，挂到客户端播放器（`biliPlayer`、`nano.createPlayer`）上，客户端设置页和播放器菜单里的 BTR 设置 |
| `bootstrap.cjs`、`preload.template.cjs` | 写进 `app.asar` 的入口和 preload |
| `patch.cjs`、`asar.cjs`、`btr-patch` | 打补丁、恢复、查看状态；`btr-patch` 用客户端自带的 electron43 当 Node 运行，不需要装 nodejs |
| `hooks/` | pacman 钩子 |
| `build.mjs` | 构建到 `dist/linux/`：`src/` 里共用的下载内核加上 `adapter/` |
| `PKGBUILD`、`.SRCINFO` | 打包；改了 PKGBUILD 要运行 `makepkg --printsrcinfo > .SRCINFO` |

- 构建：`node linux/build.mjs`；测试：`node dev/linux-patch-test.js`（也在 `npm test` 里）
- 版本号是 `CHANGELOG.md` 里最新发布的版本加 `-l` 和适配层版本（`build.mjs` 里的 `ADAPTER_REVISION`），比如 `2026.10.17.1-l1`
- 想用本地仓库而不是 GitHub：把 PKGBUILD 的 `source` 改成 `git+file:///本地仓库路径#branch=linux-desktop`，提交到本地分支后下一次 `paru` 就会重新构建，不用推送

## 和 Windows 桌面版的关系

做法和 Windows 桌面版 [Bilibili-thread-ripper-desktop](https://github.com/MrTangLuyao/Bilibili-thread-ripper-desktop) 一样：在客户端 `app.asar` 的入口加一行 `require`，由它给客户端加一个 preload，把 BTR 放进主界面和播放窗口。

`adapter/` 里的 5 个文件来自桌面版的 `src/`（MIT，提交 `2d24de0`），每个文件第一行注明了出处：

- `settings.js`、`settings-view.js`：去掉了 Windows 的自动更新、卸载按钮和“自动检查 BTR 更新”开关，Linux 上这些交给 pacman / paru
- `transport.js`、`client.js`、`player-settings.js`：原样

下载内核（`range-core`、`cdn-resolver`、`idm-downloader`、`runtime-notices`、`notification-view`）直接用本仓库 `src/` 里的版本。桌面版的适配层以后有修复，要手动合并到 `adapter/`。
