#!/bin/bash
input=$(cat)

model_name=$(echo "$input" | jq -r '.model.display_name // "unknown"')
cwd=$(echo "$input" | jq -r '.cwd // .workspace.current_dir // "."')

ctx_used=$(echo "$input" | jq -r '.context_window.total_input_tokens // 0')
ctx_max=$(echo "$input" | jq -r '.context_window.context_window_size // 0')
ctx_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

thinking_enabled=$(echo "$input" | jq -r '.thinking.enabled // false')
effort_level=$(echo "$input" | jq -r '.effort.level // empty')

rate5h=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
rate7d=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
reset5h=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
reset7d=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

format_tokens() {
    local n=$1
    if [ "$n" -ge 1000000 ]; then
        awk -v n="$n" 'BEGIN{printf "%.1fM", n/1000000}'
    elif [ "$n" -ge 10000 ]; then
        awk -v n="$n" 'BEGIN{printf "%dk", int(n/1000)}'
    elif [ "$n" -ge 1000 ]; then
        awk -v n="$n" 'BEGIN{printf "%.1fk", n/1000}'
    else
        echo "$n"
    fi
}

ctx_used_fmt=$(format_tokens "$ctx_used")
ctx_max_fmt=$(format_tokens "$ctx_max")

if [ -n "$ctx_pct" ] && [ "$ctx_pct" != "null" ]; then
    ctx_pct_fmt=$(awk -v p="$ctx_pct" 'BEGIN{printf "%.0f", p}')
else
    ctx_pct_fmt=0
fi

if [ "$thinking_enabled" = "true" ]; then
    if [ -n "$effort_level" ] && [ "$effort_level" != "null" ]; then
        thinking_str="$effort_level"
    else
        thinking_str="on"
    fi
else
    thinking_str="off"
fi

home_dir="${HOME:-$USERPROFILE}"
display_path="$cwd"
if [ -n "$home_dir" ]; then
    case "$cwd" in
        "$home_dir") display_path="~" ;;
        "$home_dir"/*) display_path="~${cwd#$home_dir}" ;;
    esac
fi

branch=$(git -C "$cwd" branch --show-current 2>/dev/null)

fg() { printf '\033[38;2;%sm' "$1"; }
PINK='255;121;198'
COMMENT='98;114;164'
ORANGE='255;184;108'
RED='255;85;85'
CYAN='139;233;253'
PURPLE='189;147;249'
FOREGROUND='248;248;242'
BRIGHTBLUE='214;172;255'
BRIGHTCYAN='164;255;255'
RESET='\033[0m'
DIM='\033[2m'

case "$thinking_str" in
    off) THINK_COLOR="$COMMENT" ;;
    minimal) THINK_COLOR="$COMMENT" ;;
    low) THINK_COLOR="$CYAN" ;;
    medium) THINK_COLOR="$PURPLE" ;;
    high) THINK_COLOR="$PINK" ;;
    xhigh) THINK_COLOR="$BRIGHTBLUE" ;;
    max) THINK_COLOR="$BRIGHTCYAN" ;;
    *) THINK_COLOR="$PINK" ;;
esac

if [ "$ctx_pct_fmt" -gt 90 ] 2>/dev/null; then
    CTX_COLOR="$RED"
elif [ "$ctx_pct_fmt" -gt 70 ] 2>/dev/null; then
    CTX_COLOR="$ORANGE"
else
    CTX_COLOR="$PINK"
fi

CONTEXT_ICONS=("󰪞" "󰪟" "󰪠" "󰪡" "󰪢" "󰪣" "󰪤" "󰪥")
idx=$(( ctx_pct_fmt * 8 / 100 ))
[ "$idx" -gt 7 ] && idx=7
[ "$idx" -lt 0 ] && idx=0
ctx_icon="${CONTEXT_ICONS[$idx]}"

CLAUDE_ICON=""
PATH_ICON="󱃪"
BRANCH_ICON=""
THINKING_ICON=""

model_part=$(printf "$(fg "$PINK")%s${RESET} $(fg "$FOREGROUND")%s${RESET} $(fg "$THINK_COLOR")%s %s${RESET}" \
    "$CLAUDE_ICON" "$model_name" "$THINKING_ICON" "$thinking_str")

path_part=$(printf "$(fg "$PINK")%s${RESET} $(fg "$COMMENT")%s${RESET}" "$PATH_ICON" "$display_path")
if [ -n "$branch" ]; then
    path_part="$path_part $(printf "$(fg "$PINK")%s${RESET} $(fg "$COMMENT")%s${RESET}" "$BRANCH_ICON" "$branch")"
fi

ctx_part=$(printf "$(fg "$PINK")%s${RESET} $(fg "$CTX_COLOR")%s/%s (%s%%)${RESET}" \
    "$ctx_icon" "$ctx_used_fmt" "$ctx_max_fmt" "$ctx_pct_fmt")

rate_color() {
    if awk -v p="$1" 'BEGIN{exit !(p>90)}'; then
        echo "$RED"
    elif awk -v p="$1" 'BEGIN{exit !(p>70)}'; then
        echo "$ORANGE"
    else
        echo "$PINK"
    fi
}

ramp_icon() {
    local pct=$1 idx
    idx=$((pct * 8 / 100))
    [ "$idx" -gt 7 ] && idx=7
    [ "$idx" -lt 0 ] && idx=0
    echo "${CONTEXT_ICONS[$idx]}"
}

countdown() {
    local diff=$1 d h m
    [ "$diff" -lt 0 ] && diff=0
    d=$((diff / 86400))
    h=$(((diff % 86400) / 3600))
    m=$(((diff % 3600) / 60))
    if [ "$d" -gt 0 ]; then
        printf "%dd:%dh" "$d" "$h"
    elif [ "$h" -gt 0 ]; then
        printf "%02dh:%02dm" "$h" "$m"
    else
        printf "%dm" "$m"
    fi
}

now=$(date +%s)

usage_part=""
if [ -n "$rate5h" ] && [ "$rate5h" != "null" ]; then
    rate5h_fmt=$(awk -v p="$rate5h" 'BEGIN{printf "%.0f", p}')
    c5h=$(rate_color "$rate5h_fmt")
    icon5h=$(ramp_icon "$rate5h_fmt")
    if [ -n "$reset5h" ] && [ "$reset5h" != "null" ]; then
        cd5h=$(countdown $((reset5h - now)))
        usage_part=$(printf "$(fg "$c5h")%s 5h %s%% (%s)${RESET}" "$icon5h" "$rate5h_fmt" "$cd5h")
    else
        usage_part=$(printf "$(fg "$c5h")%s 5h %s%%${RESET}" "$icon5h" "$rate5h_fmt")
    fi
fi
if [ -n "$rate7d" ] && [ "$rate7d" != "null" ]; then
    rate7d_fmt=$(awk -v p="$rate7d" 'BEGIN{printf "%.0f", p}')
    c7d=$(rate_color "$rate7d_fmt")
    icon7d=$(ramp_icon "$rate7d_fmt")
    if [ -n "$reset7d" ] && [ "$reset7d" != "null" ]; then
        cd7d=$(countdown $((reset7d - now)))
        piece=$(printf "$(fg "$c7d")%s 7d %s%% (%s)${RESET}" "$icon7d" "$rate7d_fmt" "$cd7d")
    else
        piece=$(printf "$(fg "$c7d")%s 7d %s%%${RESET}" "$icon7d" "$rate7d_fmt")
    fi
    if [ -n "$usage_part" ]; then
        usage_part="$usage_part $piece"
    else
        usage_part="$piece"
    fi
fi

sep=$(printf "$(fg "$COMMENT") · ${RESET}")

output="$path_part"
output="$output$sep$ctx_part"
output="$output$sep$model_part"
[ -n "$usage_part" ] && output="$output$sep$usage_part"

printf "%s" "$output"
