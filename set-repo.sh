#!/bin/sh
# 用法：./set-repo.sh <你的GitHub用户名>
# 把 package.json / README.md 里的 CHANGE-ME 换成你的用户名，然后按提示推送。
set -e
[ -n "$1" ] || { echo "用法：./set-repo.sh <你的GitHub用户名>"; exit 1; }
U="$1"
sed -i '' "s/CHANGE-ME/$U/g" package.json README.md
echo "已把仓库地址改成 https://github.com/$U/dsh-dafeiyu"
echo
echo "接下来："
echo "  git add -A && git commit -m 'chore: 指向自己的仓库'"
echo "  git remote add origin https://github.com/$U/dsh-dafeiyu.git"
echo "  git push -u origin main --tags"
echo "  dsh plugin --profile desktop remove dsh-aurabot-qq"
echo "  dsh plugin --profile desktop add github:$U/dsh-dafeiyu#v2.0.0"
