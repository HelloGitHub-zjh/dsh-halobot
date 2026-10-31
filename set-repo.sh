#!/bin/sh
# 用法：./set-repo.sh <你的GitHub用户名>
set -e
[ -n "$1" ] || { echo "用法：./set-repo.sh <你的GitHub用户名>"; exit 1; }
U="$1"
sed -i '' "s/CHANGE-ME/$U/g" package.json README.md
git add -A
git -c user.name="$(git config --global user.name 2>/dev/null || echo dafeiyu)" \
    -c user.email="$(git config --global user.email 2>/dev/null || echo dafeiyu@localhost)" \
    commit -q -m "chore: 指向自己的仓库 https://github.com/$U/dsh-dafeiyu"
git tag -d v2.0.0 >/dev/null 2>&1 || true
git tag -a v2.0.0 -m "dsh-dafeiyu 2.0.0：独立维护起点"
echo "包里的地址已改成 https://github.com/$U/dsh-dafeiyu，v2.0.0 已指着这个提交。"
echo
echo "接着执行："
echo "  git remote add origin https://github.com/$U/dsh-dafeiyu.git"
echo "  git push -u origin main --tags"
echo "  dsh plugin --profile desktop remove dsh-aurabot-qq"
echo "  dsh plugin --profile desktop add github:$U/dsh-dafeiyu#v2.0.0"
