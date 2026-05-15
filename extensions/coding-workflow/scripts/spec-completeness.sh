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

# ── 检查 5: 六要素章节完整性 ──────────────────────────────────
# 仅对 .spec.md 文件执行此检查（不对 plan.md 执行）
case "$DOC_PATH" in
	*spec.md*)
		SECTION_ISSUES=0

		# 1. Outcomes / 目标
		if ! grep -qiE '(^##.*目标|^##.*outcomes|^##.*目的|^##.*目标与范围)' "$DOC_PATH"; then
			echo "[SECTION] 缺少 'Outcomes/目标' 章节 — agent 需要具体的终态描述"
			SECTION_ISSUES=$((SECTION_ISSUES + 1))
		fi

		# 2. Scope / 范围（必须包含 out-of-scope）
		if ! grep -qiE '(^##.*范围|^##.*scope)' "$DOC_PATH"; then
			echo "[SECTION] 缺少 'Scope/范围' 章节 — agent 需要明确的范围边界"
			SECTION_ISSUES=$((SECTION_ISSUES + 1))
		fi
		if ! grep -qiE '(out.?of.?scope|不在范围内|排除|不包含)' "$DOC_PATH"; then
			echo "[SECTION] 缺少 out-of-scope 内容 — 未明确排除的范围，agent 可能自动扩大范围"
			SECTION_ISSUES=$((SECTION_ISSUES + 1))
		fi

		# 3. Constraints / 约束
		if ! grep -qiE '(^##.*约束|^##.*constraint|^##.*限制|^##.*非功能性)' "$DOC_PATH"; then
			echo "[SECTION] 缺少 'Constraints/约束' 章节 — agent 需要技术栈和性能约束"
			SECTION_ISSUES=$((SECTION_ISSUES + 1))
		fi

		# 4. Decisions made / 已做决策
		if ! grep -qiE '(^##.*已做决策|^##.*decisions|^##.*技术决策|^##.*已确定)' "$DOC_PATH"; then
			echo "[SECTION] 缺少 '已做决策' 章节 — agent 不知道决策已做出时会自行选择"
			SECTION_ISSUES=$((SECTION_ISSUES + 1))
		fi

		# 5. 行为约束 (Always/Never)
		if ! grep -qiE '(^##.*行为约束|^##.*behavioral|^##.*行为规范|always.*never|^###.*always)' "$DOC_PATH"; then
			echo "[SECTION] 缺少 '行为约束' 章节 — agent 需要 Always/Ask First/Never 边界"
			SECTION_ISSUES=$((SECTION_ISSUES + 1))
		fi

		# 6. 已有基础设施
		if ! grep -qiE '(^##.*已有基础设施|^##.*infrastructure|^##.*可复用)' "$DOC_PATH"; then
			echo "[SECTION] 缺少 '已有基础设施' 章节 — agent 需要知道哪些可以复用"
			SECTION_ISSUES=$((SECTION_ISSUES + 1))
		fi

		# 7. 验收标准
		if ! grep -qiE '(^##.*验收标准|^##.*acceptance|^##.*verification|^##.*验证|^##.*成功标准|^##.*success)' "$DOC_PATH"; then
			echo "[SECTION] 缺少 '验收标准/Verification' 章节 — agent 无法判断何时完成"
			SECTION_ISSUES=$((SECTION_ISSUES + 1))
		fi

		if [ "$SECTION_ISSUES" -gt 0 ]; then
			echo ""
			echo "[六要素检查] 缺少 $SECTION_ISSUES 个必填章节"
			ISSUES=$((ISSUES + SECTION_ISSUES))
		fi

		# ── 检查 6: [AMBIGUOUS] 残留 ─────────────────────────────
		AMBIGUOUS_COUNT=$(grep -cE '\[AMBIGUOUS\]' "$DOC_PATH" || true)
		if [ "$AMBIGUOUS_COUNT" -gt 0 ]; then
			echo ""
			echo "[AMBIGUOUS] 发现 $AMBIGUOUS_COUNT 个未解决的歧义标记 — 所有歧义必须在进入 plan 前解决"
			grep -nE '\[AMBIGUOUS\]' "$DOC_PATH" | while IFS= read -r amb_line; do
				echo "  $amb_line"
			done
			ISSUES=$((ISSUES + AMBIGUOUS_COUNT))
		fi
		;;
esac

if [ "$ISSUES" -eq 0 ]; then
	echo "✓ 自包含检查通过: 未发现问题"
	exit 0
else
	echo ""
	echo "发现 $ISSUES 个问题，请修复后重新运行检查。"
	exit 1
fi
