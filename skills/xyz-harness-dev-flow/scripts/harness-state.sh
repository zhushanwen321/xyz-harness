#!/bin/bash
# harness-state.sh — dev-flow 状态机
# 管理阶段推进、回退、验证。防止主 agent 跳过门禁。
#
# 调用方式：
#   harness-state.sh advance <stage> <project_root>   — 推进到某阶段（前置阶段必须全部 pass）
#   harness-state.sh pass <stage> <project_root>       — 标记某阶段通过（写入 .pass 文件）
#   harness-state.sh rollback <stage> <project_root>   — 回退到某阶段（清除该阶段及之后的 pass 文件）
#   harness-state.sh status <project_root>             — 查看当前状态
#   harness-state.sh check <project_root>              — 检查流程完整性（hook 用）
#
# 状态文件：.xyz-harness/state.json
# Gate 文件：.xyz-harness/gate/stage-{NN}.pass
#
# 退出码：0=成功，1=失败

set -euo pipefail

# ── 颜色 ──────────────────────────────────────────────────────────
if [[ -t 1 ]] && command -v tput &>/dev/null && [[ $(tput colors 2>/dev/null || echo 0) -ge 8 ]]; then
    C_RED='\033[0;31m' C_GREEN='\033[0;32m' C_YELLOW='\033[0;33m' C_BOLD='\033[1m' C_RESET='\033[0m'
else
    C_RED='' C_GREEN='' C_YELLOW='' C_BOLD='' C_RESET=''
fi
info()  { echo -e "${C_BOLD}[STATE]${C_RESET} $*"; }
ok()    { echo -e "${C_GREEN}[OK]${C_RESET} $*"; }
err()   { echo -e "${C_RED}[ERR]${C_RESET} $*"; }

# ── 阶段依赖定义（用函数替代关联数组，兼容 bash 3.x） ──────
# 返回指定阶段的前置阶段列表（空格分隔）
get_prerequisites() {
    case "$1" in
        1)  echo "" ;;
        2)  echo "1" ;;
        3)  echo "2" ;;
        4)  echo "3" ;;
        5)  echo "4" ;;
        6)  echo "5" ;;
        7)  echo "6" ;;
        8)  echo "7" ;;
        9)  echo "8" ;;
        10) echo "9" ;;
        11) echo "10" ;;
        *)  echo "" ;;
    esac
}

# 有 L1 门禁的阶段（gate-script.sh 会生成 .pass 文件）
is_l1_stage() {
    case "$1" in 1|3|5|7|8|9) return 0 ;; *) return 1 ;; esac
}

# ── 工具函数 ──────────────────────────────────────────────────────

state_file() { echo "$1/.xyz-harness/state.json"; }
gate_dir()   { echo "$1/.xyz-harness/gate"; }
pass_file()  { echo "$(gate_dir "$1")/stage-$(printf '%02d' "$2").pass"; }

# 读取 state.json 中的值
state_get() {
    local sf stage field
    sf="$1"; stage="$2"; field="$3"
    if [[ ! -f "$sf" ]]; then return 1; fi
    # 用 node 或 python 解析 JSON
    if command -v node &>/dev/null; then
        node -e "const s=JSON.parse(require('fs').readFileSync('$sf','utf8')); const e=s.stages?.find(x=>x.stage===$stage); if(e) console.log(e['$field']||'')" 2>/dev/null
    elif command -v python3 &>/dev/null; then
        python3 -c "import json,sys; s=json.load(open('$sf')); e=[x for x in s.get('stages',[]) if x['stage']==$stage]; print(e[0].get('$field','') if e else '')" 2>/dev/null
    fi
}

# 写入 state.json
state_write() {
    local sf="$1"; shift
    mkdir -p "$(dirname "$sf")"
    # 如果文件已存在，合并；否则创建
    if [[ -f "$sf" ]] && command -v node &>/dev/null; then
        node -e "
const fs=require('fs');
const args=JSON.parse('$(
            # 将参数编码为 JSON 对象
            echo "$@" | while IFS= read -r line; do echo "$line"; done
        )');
" 2>/dev/null || true
    fi
    # 简化：直接用追加行的方式更新
    echo "{\"updated\":\"$(date -Iseconds)\"}" > "$sf"
}

# 检查某阶段的 pass 文件是否存在且格式正确
check_pass() {
    local pf
    pf=$(pass_file "$1" "$2")
    if [[ ! -f "$pf" ]]; then
        return 1
    fi
    # 验证格式：第一行以 "pass at" 开头
    local first_line
    first_line=$(head -1 "$pf" 2>/dev/null || true)
    if [[ "$first_line" != pass\ at* ]]; then
        err "pass file format invalid: $pf (first line: $first_line)"
        return 1
    fi
    return 0
}

# ── 子命令 ────────────────────────────────────────────────────────

cmd_advance() {
    local stage="$1" project_root="$2"
    local gd
    gd=$(gate_dir "$project_root")
    mkdir -p "$gd"

    info "advance → stage ${stage}"

    # 检查前置阶段
    local prereqs
    prereqs=$(get_prerequisites "$stage")
    if [[ -n "$prereqs" ]]; then
        for pre in $prereqs; do
            if ! check_pass "$project_root" "$pre"; then
                err "prerequisite stage ${pre} not passed"
                err "cannot advance to stage ${stage} — run stage ${pre} first"
                exit 1
            fi
            ok "prerequisite stage ${pre}: passed"
        done
    fi

    # 更新 state.json
    if command -v node &>/dev/null; then
        node -e "
const fs=require('fs');
const sf='${project_root}/.xyz-harness/state.json';
let state={};
try { state=JSON.parse(fs.readFileSync(sf,'utf8')); } catch {}
state.current_stage=${stage};
state.stages=state.stages||[];
const existing=state.stages.findIndex(s=>s.stage===${stage});
if(existing>=0){state.stages[existing].status='in_progress';state.stages[existing].started_at=new Date().toISOString();}
else{state.stages.push({stage:${stage},status:'in_progress',started_at:new Date().toISOString()});}
fs.writeFileSync(sf,JSON.stringify(state,null,2));
" 2>/dev/null
    fi

    ok "advanced to stage ${stage}"
}

cmd_pass() {
    local stage="$1" project_root="$2"
    local gd
    gd=$(gate_dir "$project_root")
    mkdir -p "$gd"

    local pf
    pf=$(pass_file "$project_root" "$stage")

    # 检查 pass 文件是否由 gate-script.sh 生成（L1 阶段）
    if is_l1_stage "$stage"; then
        if [[ ! -f "$pf" ]]; then
            err "stage ${stage} requires L1 gate pass (generated by gate-script.sh)"
            err "run: gate-script.sh $(printf '%02d' "$stage") ${project_root}"
            exit 1
        fi
        if ! check_pass "$project_root" "$stage"; then
            err "pass file for stage ${stage} is invalid"
            exit 1
        fi
        ok "stage ${stage}: L1 gate passed"
    else
        # 非 L1 阶段，直接生成 pass 文件
        echo "pass at $(date -Iseconds)" > "$pf"
        echo "stage ${stage} gate: L2 validated" >> "$pf"
        ok "stage ${stage}: L2 gate passed"
    fi

    # 更新 state.json
    if command -v node &>/dev/null; then
        node -e "
const fs=require('fs');
const sf='${project_root}/.xyz-harness/state.json';
let state={};
try { state=JSON.parse(fs.readFileSync(sf,'utf8')); } catch {}
state.current_stage=${stage};
state.stages=state.stages||[];
const existing=state.stages.findIndex(s=>s.stage===${stage});
if(existing>=0){
    state.stages[existing].status='pass';
    state.stages[existing].completed_at=new Date().toISOString();
}else{
    state.stages.push({stage:${stage},status:'pass',completed_at:new Date().toISOString()});
}
fs.writeFileSync(sf,JSON.stringify(state,null,2));
" 2>/dev/null
    fi

    ok "stage ${stage}: PASS"
}

cmd_rollback() {
    local target="$1" project_root="$2"
    local gd
    gd=$(gate_dir "$project_root")

    info "rollback → stage ${target}"

    # 清除目标阶段及之后所有阶段的 pass 文件
    for s in $(seq "$target" 11); do
        local pf
        pf=$(pass_file "$project_root" "$s")
        if [[ -f "$pf" ]]; then
            rm "$pf"
            info "removed $(basename "$pf")"
        fi
    done

    # 更新 state.json
    if command -v node &>/dev/null; then
        node -e "
const fs=require('fs');
const sf='${project_root}/.xyz-harness/state.json';
let state={};
try { state=JSON.parse(fs.readFileSync(sf,'utf8')); } catch {}
state.current_stage=${target};
state.stages=(state.stages||[]).filter(s=>s.stage<${target});
fs.writeFileSync(sf,JSON.stringify(state,null,2));
" 2>/dev/null
    fi

    ok "rolled back to stage ${target}"
}

cmd_status() {
    local project_root="$1"
    local gd
    gd=$(gate_dir "$project_root")

    info "=== Harness Status ==="

    # 显示 state.json
    local sf
    sf=$(state_file "$project_root")
    if [[ -f "$sf" ]]; then
        info "State file: $sf"
        if command -v node &>/dev/null; then
            node -e "
const s=JSON.parse(require('fs').readFileSync('$sf','utf8'));
console.log('Current stage:', s.current_stage || 'unknown');
(s.stages||[]).forEach(st => console.log('  Stage', st.stage, ':', st.status, st.completed_at||''));
" 2>/dev/null
        fi
    else
        info "No state file found"
    fi

    echo ""
    info "Gate files:"
    for s in $(seq 1 11); do
        local pf
        pf=$(pass_file "$project_root" "$s")
        if [[ -f "$pf" ]]; then
            local first_line
            first_line=$(head -1 "$pf")
            ok "stage $(printf '%02d' "$s"): $first_line"
        fi
    done
}

# check 命令：供 hook 调用，检查流程完整性
# 输出 JSON，退出码 0=通过，2=需警告（反馈给 agent）
cmd_check() {
    local project_root="$1"
    local sf
    sf=$(state_file "$project_root")

    if [[ ! -f "$sf" ]]; then
        # 没有 state 文件，可能是还没开始 dev-flow，不拦截
        echo '{"status":"no_harness","message":"no harness state found"}'
        exit 0
    fi

    local current_stage
    current_stage=$(node -e "
const s=JSON.parse(require('fs').readFileSync('$sf','utf8'));
console.log(s.current_stage||0);
" 2>/dev/null || echo "0")

    if [[ "$current_stage" == "0" ]]; then
        echo '{"status":"no_harness","message":"no active stage"}'
        exit 0
    fi

    # 检查当前阶段的 pass 文件
    local pf
    pf=$(pass_file "$project_root" "$current_stage")
    if [[ ! -f "$pf" ]]; then
        echo "{\"status\":\"gate_missing\",\"stage\":$current_stage,\"message\":\"Stage $current_stage gate not passed. Run gate-script.sh $(printf '%02d' "$current_stage") $project_root before proceeding.\"}"
        exit 2
    fi

    # 检查 pass 文件格式
    local first_line
    first_line=$(head -1 "$pf" 2>/dev/null || true)
    if [[ "$first_line" != pass\ at* ]]; then
        echo "{\"status\":\"gate_invalid\",\"stage\":$current_stage,\"message\":\"Stage $current_stage pass file has invalid format. Must be generated by gate-script.sh.\"}"
        exit 2
    fi

    echo "{\"status\":\"ok\",\"stage\":$current_stage,\"message\":\"Stage $current_stage gate passed\"}"
    exit 0
}

# ── 主入口 ────────────────────────────────────────────────────────

COMMAND="${1:-}"
shift || true

case "$COMMAND" in
    advance) cmd_advance "$@" ;;
    pass)    cmd_pass "$@" ;;
    rollback) cmd_rollback "$@" ;;
    status)  cmd_status "$@" ;;
    check)   cmd_check "$@" ;;
    *)
        echo "Usage: harness-state.sh <advance|pass|rollback|status|check> <stage> <project_root>"
        echo ""
        echo "Commands:"
        echo "  advance <stage> <project_root>   — 推进到某阶段（前置阶段必须 pass）"
        echo "  pass <stage> <project_root>       — 标记某阶段通过"
        echo "  rollback <stage> <project_root>   — 回退到某阶段"
        echo "  status <project_root>             — 查看当前状态"
        echo "  check <project_root>              — 检查流程完整性（hook 用）"
        exit 1
        ;;
esac
