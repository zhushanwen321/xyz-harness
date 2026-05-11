#!/bin/bash
# ============================================================
# spec-completeness.sh — 自包含检查脚本
# 扫描 spec.md / plan.md，检查：
#   1. 引用的文件路径是否存在
#   2. 占位符（TODO / TBD / FIXME / 待补充）
#   3. 模糊引用（"某个文件" / "对应模块"）
#
# 用法: spec-completeness.sh <spec_or_plan_path> <project_root>
# 退出码: 0 = 全部通过, 1 = 发现问题
# ============================================================

set -e

if [ $# -lt 2 ]; then
	echo "用法: $0 <spec_or_plan_path> <project_root>"
	echo "示例: $0 .xyz-harness/2026-05-11-my-feature/spec.md /path/to/project"
	exit 1
fi

DOC_PATH="$1"
PROJECT_ROOT="$2"

if [ ! -f "$DOC_PATH" ]; then
	echo "错误: 文件不存在: $DOC_PATH"
	exit 1
fi

if [ ! -d "$PROJECT_ROOT" ]; then
	echo "错误: 项目根目录不存在: $PROJECT_ROOT"
	exit 1
fi

ISSUES=0
IN_CODE_BLOCK=0

# 逐行扫描
LINE_NUM=0
while IFS= read -r line || [ -n "$line" ]; do
	LINE_NUM=$((LINE_NUM + 1))

	# 跳过代码块
	case "$line" in
		*\`\`\`*)
			if [ "$IN_CODE_BLOCK" -eq 0 ]; then
				IN_CODE_BLOCK=1
			else
				IN_CODE_BLOCK=0
			fi
			continue
			;;
	esac

	if [ "$IN_CODE_BLOCK" -eq 1 ]; then
		continue
	fi

	# 跳过空行和纯标题行
	case "$line" in
		''|'#'*|'##'*|'###'*|'####'*|'-----'*|'======'*)
			continue
			;;
	esac

	# 跳过 URL
	has_url=0
	case "$line" in
		*http://*|*https://*)
			has_url=1
			;;
	esac

	# ── 检查 1: 文件路径引用 ──────────────────────────
	# 匹配包含扩展名的路径: src/xxx.ts, lib/xxx.rs 等
	# 用字符串处理而非正则（bash 3 兼容）
	has_path_ref=0
	for word in $line; do
		case "$word" in
			*src/*|*lib/*|*app/*|*packages/*|*services/*|*components/*|*utils/*|*hooks/*|*plugins/*|*scripts/*|*config/*|*test/*|*tests/*|*__tests__/*|*api/*|*routes/*|*middleware/*|*models/*|*views/*|*controllers/*)
				has_path_ref=1
				# 去掉可能的标点后缀
				clean_word=$(echo "$word" | sed 's/[.,;:!?)]$//' | sed "s/'$//" | sed 's/"$//')
				# 去掉代码标记 `path`
				clean_word=$(echo "$clean_word" | sed 's/^`//' | sed 's/`$//')
				# 跳过 node_modules
				case "$clean_word" in
					*node_modules*|*.git/*)
						continue
						;;
				esac
				# 检查文件是否存在
				if [ ! -f "$PROJECT_ROOT/$clean_word" ]; then
					# 可能是目录引用，检查目录
					if [ ! -d "$PROJECT_ROOT/$clean_word" ]; then
						echo "[MISSING] Line $LINE_NUM: 引用路径 \"$clean_word\" 在项目中不存在"
						ISSUES=$((ISSUES + 1))
					fi
				fi
				;;
		esac
	done

	# ── 检查 2: 占位符 ────────────────────────────────
	lower_line=$(echo "$line" | tr '[:upper:]' '[:lower:]')
	case "$lower_line" in
		*todo*|*tbd*|*fixme*|*xxx*)
			echo "[PLACEHOLDER] Line $LINE_NUM: 包含占位符 TODO/TBD/FIXME — 内容不完整"
			ISSUES=$((ISSUES + 1))
			;;
	esac

	# 中英文占位符
	case "$line" in
		*待补充*|*这里填写*|*待完善*|*需要补充*|*____*)
			echo "[PLACEHOLDER] Line $LINE_NUM: 包含占位符 \"$(echo "$line" | grep -oE '待补充|这里填写|待完善|需要补充|_{4,}' | head -1)\" — 内容不完整"
			ISSUES=$((ISSUES + 1))
			;;
	esac

	# ── 检查 3: 模糊引用 ──────────────────────────────
	# 只对非代码行检查
	if [ "$has_url" -eq 0 ]; then
		case "$line" in
			*某个文件*|*某处*|*相应位置*|*对应模块*)
				echo "[VAGUE] Line $LINE_NUM: \"$(echo "$line" | grep -oE '某个文件|某处|相应位置|对应模块' | head -1)\" 是模糊引用 — 请指定确切文件路径"
				ISSUES=$((ISSUES + 1))
				;;
		esac
	fi

	# ── 检查 4: 交叉引用 ──────────────────────────────
	case "$line" in
		*\`file:\`*|*\`@see\`*)
			ref_path=$(echo "$line" | sed 's/.*`file: //' | sed 's/`.*//' 2>/dev/null)
			if [ -n "$ref_path" ] && [ ! -f "$PROJECT_ROOT/$ref_path" ]; then
				echo "[MISSING] Line $LINE_NUM: 交叉引用 \"$ref_path\" 在项目中不存在"
				ISSUES=$((ISSUES + 1))
			fi
			;;
	esac

done < "$DOC_PATH"

if [ "$ISSUES" -eq 0 ]; then
	echo "✓ 自包含检查通过: 未发现问题"
	exit 0
else
	echo ""
	echo "发现 $ISSUES 个问题，请修复后重新运行检查。"
	exit 1
fi
