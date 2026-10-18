# 线程撕裂者 Linux 客户端版

给 AUR 的哔哩哔哩客户端 `bilibili-bin` 加上线程撕裂者（BTR）的多线程下载。装好后运行 `paru` 就会同时更新客户端和 BTR。

## 安装

```bash
paru -S bilibili-bin
git clone -b linux-desktop https://github.com/hjy1/Bilibili-thread-ripper.git ~/.local/share/btr-pkgbuild
printf '\n[btr]\nPath = %s\n' ~/.local/share/btr-pkgbuild/linux | sudo tee -a /etc/paru.conf
paru -S bilibili-thread-ripper-linux-git
```

装好后重新打开客户端，设置页里会有“线程撕裂者”一栏。

## 更新

```bash
paru
```

## 卸载

```bash
sudo pacman -R bilibili-thread-ripper-linux-git
```

卸载后客户端恢复成官方原版。

## 出问题时

```bash
/usr/lib/bilibili-thread-ripper/btr-patch status        # 查看状态，正常是 "current"
sudo /usr/lib/bilibili-thread-ripper/btr-patch patch    # 重新打补丁
paru -S bilibili-bin                                    # 重装客户端，会自动重新打补丁
```

## 说明

- 客户端和 BTR 是两个独立的包，各自更新；任何一个装上或升级后，pacman 钩子都会自动重新打补丁
- 官方原文件备份在 `/var/lib/bilibili-thread-ripper/`，卸载 BTR 时用它恢复
- `pacman -Qkk bilibili-bin` 报告 `app.asar` 被修改是正常的
- 适配层来自 [Bilibili-thread-ripper-desktop](https://github.com/MrTangLuyao/Bilibili-thread-ripper-desktop)（MIT），去掉了 Windows 的自动更新；下载内核用本仓库的 `src/`。构建 `node linux/build.mjs`，测试 `node dev/linux-patch-test.js`
