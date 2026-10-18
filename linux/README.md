# 线程撕裂者 Linux 客户端版

给 Linux 上的哔哩哔哩客户端（[msojocs/bilibili-linux](https://github.com/msojocs/bilibili-linux)，AUR 包 `bilibili-bin`）加上线程撕裂者（BTR）的多线程、多 CDN 下载。播放、弹幕、字幕仍由客户端自己负责，BTR 只接管视频下载，相当于网页版的兼容模式。

做法和 Windows 桌面版 [Bilibili-thread-ripper-desktop](https://github.com/MrTangLuyao/Bilibili-thread-ripper-desktop) 一样：在客户端 `app.asar` 的入口加一行 `require`，由它给客户端加一个 preload，把 BTR 放进主界面和播放窗口。打补丁、更新和卸载都交给 pacman：

- 装上 BTR，或者 `bilibili-bin` 每次安装、升级之后，pacman 钩子都会重新打补丁
- 卸载 BTR 时，钩子把官方 `app.asar` 原样放回去（未修改的原文件保存在 `/var/lib/bilibili-thread-ripper/`，约 170 MB）
- 配好下面的 paru 设置后，一次 `paru` 同时更新 `bilibili-bin` 和 BTR

## 安装（已经装好 AUR 的 bilibili-bin）

**推荐：让 paru 自动更新。** 把打包脚本克隆到本地，交给 paru 当作一个 PKGBUILD 仓库：

```bash
git clone -b linux-desktop https://github.com/hjy1/Bilibili-thread-ripper.git ~/.local/share/btr-pkgbuild

sudo tee -a /etc/paru.conf >/dev/null <<EOF

[btr]
Path = $HOME/.local/share/btr-pkgbuild/linux
EOF

paru -S bilibili-thread-ripper-linux-git
```

还要确认 `/etc/paru.conf` 的 `[options]` 里有一行没被注释掉的 `Devel`（paru 默认就有）。这样每次运行 `paru`，它都会检查 `linux-desktop` 分支有没有新提交，有就重新构建 BTR；`bilibili-bin` 照常从 AUR 更新，两种更新之后钩子都会重新打补丁。

**只装一次、不要自动更新：**

```bash
git clone -b linux-desktop https://github.com/hjy1/Bilibili-thread-ripper.git
cd Bilibili-thread-ripper/linux
makepkg -si
```

以后要更新就在同一个目录里再运行 `makepkg -si`。

装好后**完全退出客户端再重新打开**，在客户端的设置页能看到“线程撕裂者”一栏，播放器 ⚙ 的“更多播放设置”里也有 CDN 和线程数。BTR 平时不弹提示；想看它在干什么，在设置里勾选“Debug 模式”。

## 检查、卸载

```bash
/usr/lib/bilibili-thread-ripper/btr-patch status   # 当前客户端有没有打上补丁、是哪个版本
sudo pacman -R bilibili-thread-ripper-linux-git    # 卸载 BTR，同时恢复官方客户端
```

`pacman -Qkk bilibili-bin` 会报告 `app.asar` 被修改过，这是补丁本身，属于正常现象。万一补丁出了问题，`paru -S bilibili-bin` 重装客户端就能得到干净的官方文件，下一次钩子会重新打补丁。

## 目录

| 文件 | 作用 |
|---|---|
| `adapter/` | 客户端适配层：接管播放窗口里的 `fetch` / `XMLHttpRequest`，挂到客户端播放器（`biliPlayer`、`nano.createPlayer`）上，客户端设置页和播放器菜单里的 BTR 设置 |
| `bootstrap.cjs`、`preload.template.cjs` | 写进 `app.asar` 的入口和 preload |
| `patch.cjs`、`asar.cjs`、`btr-patch` | 打补丁、恢复、查看状态；`btr-patch` 用客户端自带的 electron43 当 Node 运行 |
| `hooks/` | pacman 钩子 |
| `build.mjs` | 构建到 `dist/linux/`：`src/` 里共用的下载内核加上 `adapter/` |
| `PKGBUILD`、`.SRCINFO` | 打包；改了 PKGBUILD 要运行 `makepkg --printsrcinfo > .SRCINFO` |

测试：`node dev/linux-patch-test.js`（也在 `npm test` 里）。

## 和 Windows 桌面版的关系

`adapter/` 里的 5 个文件来自 Bilibili-thread-ripper-desktop 的 `src/`（MIT，提交 `2d24de0`），每个文件第一行注明了出处。改动只有：

- `settings.js`、`settings-view.js`：去掉了 Windows 的自动更新、卸载按钮和“自动检查 BTR 更新”开关，Linux 上这些交给 pacman / paru
- `transport.js`、`client.js`、`player-settings.js`：原样

下载内核（`range-core`、`cdn-resolver`、`idm-downloader`、`runtime-notices`、`notification-view`）直接用本仓库 `src/` 里的版本，不再复制一份。桌面版的适配层以后有修复，要手动合并到 `adapter/`。
