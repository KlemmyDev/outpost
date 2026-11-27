#!/usr/bin/env bash
# Outpost helper for Proxmox VE. Run on the Proxmox host as root, from the
# web UI's Shell or over SSH. It creates a container with Outpost installed,
# or updates, rolls back or checks one, without logging into the container.
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/KlemmyDev/outpost/main/scripts/proxmox-lxc.sh)
#
#   bash proxmox-lxc.sh                    menu: default or advanced settings
#   bash proxmox-lxc.sh --yes              create with the recommended settings, no questions
#   bash proxmox-lxc.sh --ctid 120 --disk 300 --ip 192.168.1.50/24 --gateway 192.168.1.1 --yes
#   bash proxmox-lxc.sh --update 120       update Outpost inside CT 120
#   bash proxmox-lxc.sh --rollback 120     go back to the version before the last update
#   bash proxmox-lxc.sh --status 120       version, channel and address
#   bash proxmox-lxc.sh --usb 120 [device] pass a USB MeshCore radio through to CT 120
#
# Settings: --ctid --hostname --cores --memory (MB) --disk (GB) --storage
#           --bridge --ip (dhcp or CIDR) --gateway --vlan --channel
#           --password --ssh-key FILE
set -euo pipefail

REPO="${OUTPOST_REPO:-KlemmyDev/outpost}"
APP_DIR=/opt/outpost

# Recommended: 4 cores for quick image builds, 4 GB RAM for the build and the
# offline library, and 250 GB for Wikipedia with pictures (~110 GB), Australian
# maps (~20 GB), plus backups and room to update.
CORES=4 MEMORY=4096 DISK=250 SWAP=512
CTID="" CT_HOSTNAME=outpost STORAGE="" BRIDGE=vmbr0 IP=dhcp GATEWAY="" VLAN="" CHANNEL=beta
PASSWORD="" SSH_KEY="" YES=0 MODE=create TARGET="" USB_DEV=""

while [ $# -gt 0 ]; do
  case "$1" in
    --ctid) CTID="$2"; shift ;;
    --hostname) CT_HOSTNAME="$2"; shift ;;
    --cores) CORES="$2"; shift ;;
    --memory) MEMORY="$2"; shift ;;
    --disk) DISK="$2"; shift ;;
    --storage) STORAGE="$2"; shift ;;
    --bridge) BRIDGE="$2"; shift ;;
    --ip) IP="$2"; shift ;;
    --gateway) GATEWAY="$2"; shift ;;
    --vlan) VLAN="$2"; shift ;;
    --channel) CHANNEL="$2"; shift ;;
    --password) PASSWORD="$2"; shift ;;
    --ssh-key) SSH_KEY="$2"; shift ;;
    --yes|-y) YES=1 ;;
    --update) MODE=update; TARGET="$2"; shift ;;
    --rollback) MODE=rollback; TARGET="$2"; shift ;;
    --status) MODE=status; TARGET="$2"; shift ;;
    --usb) MODE=usb; TARGET="$2"; shift; if [[ "${2:-}" == /dev/* ]]; then USB_DEV="$2"; shift; fi ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

if [ -t 1 ]; then B=$'\033[1m' G=$'\033[32m' Y=$'\033[33m' R=$'\033[31m' N=$'\033[0m'; else B='' G='' Y='' R='' N=''; fi
say()  { printf '%s==>%s %s\n' "$B" "$N" "$*"; }
warn() { printf '%s!!%s  %s\n' "$Y" "$N" "$*" >&2; }
die()  { printf '%sxx%s  %s\n' "$R" "$N" "$*" >&2; exit 1; }

command -v pct >/dev/null 2>&1 || die "Run this on the Proxmox VE host. pct wasn't found."
[ "$(id -u)" -eq 0 ] || die "Run this as root on the Proxmox host."

in_ct() { pct exec "$1" -- bash -lc "$2"; }

# --- Update, rollback, status ---------------------------------------------------
ct_has_outpost() {
  pct status "$1" >/dev/null 2>&1 || die "There's no CT $1."
  pct status "$1" | grep -q running || { say "Starting CT $1"; pct start "$1"; sleep 3; }
  in_ct "$1" "test -f $APP_DIR/install.sh" || die "CT $1 doesn't have Outpost in $APP_DIR."
}

case "$MODE" in
  update)   ct_has_outpost "$TARGET"; say "Updating Outpost in CT $TARGET"; in_ct "$TARGET" "bash $APP_DIR/install.sh --yes"; exit 0 ;;
  rollback) ct_has_outpost "$TARGET"; say "Rolling back Outpost in CT $TARGET"; in_ct "$TARGET" "bash $APP_DIR/install.sh --rollback --yes"; exit 0 ;;
  status)
    ct_has_outpost "$TARGET"
    in_ct "$TARGET" "cd $APP_DIR && echo \"version \$(node -p 2>/dev/null \"require('./package.json').version\" || sed -n 's/.*\"version\": *\"\\([^\"]*\\)\".*/\\1/p' package.json | head -n1)\" \
      && echo \"commit  \$(git rev-parse --short HEAD)\" && echo \"channel \$(cat data/update/channel 2>/dev/null || echo beta)\" \
      && echo \"address http://\$(hostname -I | awk '{print \$1}'):\$(sed -n 's/^PORT=//p' .env)\""
    exit 0 ;;
  usb)
    # Passes a USB serial radio (MeshCore companion firmware) into the
    # container as /dev/meshcore, then points Outpost at it.
    ct_has_outpost "$TARGET"
    if [ -z "$USB_DEV" ]; then
      mapfile -t devs < <(ls /dev/serial/by-id/* 2>/dev/null || true)
      [ "${#devs[@]}" -gt 0 ] || die "No USB serial devices found. Plug the radio into this Proxmox host and try again."
      if [ "${#devs[@]}" -eq 1 ]; then USB_DEV="${devs[0]}"; else
        echo "Which one is the radio?"
        select d in "${devs[@]}"; do [ -n "$d" ] && USB_DEV="$d" && break; done
      fi
    fi
    [ -e "$USB_DEV" ] || die "$USB_DEV doesn't exist."
    real="$(readlink -f "$USB_DEV")"
    major=$((16#$(stat -c %t "$real")))
    serial="$(udevadm info -q property -n "$real" 2>/dev/null | sed -n 's/^ID_SERIAL=//p')"
    conf="/etc/pve/lxc/$TARGET.conf"
    say "Radio: $USB_DEV ($real, device $major)"
    cat <<MSG

This will:
  - let CT $TARGET use serial devices with major number $major
  - mount the radio inside it as /dev/meshcore
  - add a udev rule on this host so the container can open it
    (/etc/udev/rules.d/99-outpost-meshcore.rules, readable and writable by all)
  - set MESHCORE_DEVICE in Outpost's .env and restart CT $TARGET
MSG
    if [ "$YES" -ne 1 ]; then
      read -r -p "Go ahead? [y/N] " ok
      [[ "$ok" =~ ^[Yy] ]] || { echo "Nothing changed."; exit 0; }
    fi
    grep -qxF "lxc.cgroup2.devices.allow: c $major:* rwm" "$conf" || echo "lxc.cgroup2.devices.allow: c $major:* rwm" >> "$conf"
    sed -i '\#dev/meshcore none bind#d' "$conf"
    echo "lxc.mount.entry: $USB_DEV dev/meshcore none bind,optional,create=file" >> "$conf"
    if [ -n "$serial" ]; then
      echo "SUBSYSTEM==\"tty\", ENV{ID_SERIAL}==\"$serial\", MODE=\"0666\"" > /etc/udev/rules.d/99-outpost-meshcore.rules
      udevadm control --reload-rules && udevadm trigger --subsystem-match=tty || true
    fi
    chmod 0666 "$real" || true
    in_ct "$TARGET" "cd $APP_DIR && touch .env && (grep -q '^MESHCORE_DEVICE=' .env && sed -i 's#^MESHCORE_DEVICE=.*#MESHCORE_DEVICE=/dev/meshcore#' .env || echo MESHCORE_DEVICE=/dev/meshcore >> .env)"
    say "Restarting CT $TARGET"
    pct reboot "$TARGET"
    for _ in $(seq 1 30); do in_ct "$TARGET" "test -e /dev/meshcore" 2>/dev/null && break; sleep 2; done
    in_ct "$TARGET" "cd $APP_DIR && bash install.sh start" || warn "Outpost didn't restart cleanly; run: bash proxmox-lxc.sh --status $TARGET"
    say "Done. In Outpost, open Messages and choose USB cable (device /dev/meshcore)."
    exit 0 ;;
esac

# --- Defaults from this host ----------------------------------------------------
[ -n "$CTID" ] || CTID="$(pvesh get /cluster/nextid)"

# Storages that can hold container disks, with free space in GB.
storages() { pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $3=="active" {printf "%s %d\n", $1, $6/1048576}'; }
free_gb() { storages | awk -v s="$1" '$1==s {print $2}'; }
if [ -z "$STORAGE" ]; then
  STORAGE="$(storages | awk '$1=="local-lvm"{print $1}')"
  [ -n "$STORAGE" ] || STORAGE="$(storages | sort -k2 -n -r | awk 'NR==1{print $1}')"
fi
TEMPLATE_STORAGE="$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1 && $3=="active" {print $1}' | head -n 1)"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"

# --- Menus -----------------------------------------------------------------------
TITLE="Outpost for Proxmox VE"
HAVE_WT=0; command -v whiptail >/dev/null 2>&1 && [ -t 0 ] && HAVE_WT=1
wt() { whiptail --backtitle "$TITLE" "$@" 3>&1 1>&2 2>&3; }
cancelled() { clear; echo "Cancelled. Nothing was created."; exit 0; }
input() { # input "Label" default -> value
  wt --title "Advanced settings" --inputbox "$1" 10 64 "$2" || cancelled
}

advanced() {
  CTID="$(input "Container ID" "$CTID")"
  CT_HOSTNAME="$(input "Hostname" "$CT_HOSTNAME")"
  CORES="$(input "CPU cores (recommended: 4)" "$CORES")"
  MEMORY="$(input "Memory in MB (recommended: 4096)" "$MEMORY")"
  DISK="$(input "Disk size in GB (recommended: 250, enough for Wikipedia with pictures)" "$DISK")"

  local items=() name gb
  while read -r name gb; do items+=("$name" "${gb} GB free"); done < <(storages)
  [ ${#items[@]} -gt 0 ] || die "No active storage can hold container disks."
  STORAGE="$(wt --title "Storage" --default-item "$STORAGE" --menu "Where should the container's disk live?" 16 64 6 "${items[@]}")" || cancelled

  BRIDGE="$(input "Network bridge" "$BRIDGE")"
  if wt --title "Network" --yes-button "DHCP" --no-button "Static IP" --yesno "How should the container get its address?\n\nA static IP keeps Outpost at the same address for everyone at home." 12 64; then
    IP=dhcp GATEWAY=""
  else
    IP="$(input "Static IP with prefix, e.g. 192.168.1.50/24" "${IP/dhcp/}")"
    GATEWAY="$(input "Gateway, e.g. 192.168.1.1" "$GATEWAY")"
  fi
  VLAN="$(input "VLAN tag (leave blank for none)" "$VLAN")"

  CHANNEL="$(wt --title "Release channel" --default-item "$CHANNEL" --menu "Which updates should Outpost follow?" 14 70 3 \
    stable "Tested releases only. Best for most homes." \
    beta "New features a little earlier (recommended for now)." \
    nightly "Every change as soon as it lands. Can break.")" || cancelled

  if wt --title "Container login" --defaultno --yesno "Set a root password for the container's console?\n\nNot needed for Outpost itself: you can always get in with 'pct enter $CTID' from this host." 12 64; then
    local p1 p2
    p1="$(wt --title "Container login" --passwordbox "Root password" 10 64)" || cancelled
    p2="$(wt --title "Container login" --passwordbox "Root password again" 10 64)" || cancelled
    [ "$p1" = "$p2" ] || { wt --msgbox "The passwords didn't match. No password was set." 8 50; p1=""; }
    PASSWORD="$p1"
  fi
  if [ -f /root/.ssh/authorized_keys ] && wt --title "Container login" --defaultno --yesno "Copy this host's SSH keys (/root/.ssh/authorized_keys) into the container?" 10 64; then
    SSH_KEY=/root/.ssh/authorized_keys
  fi
}

if [ "$YES" -eq 0 ] && [ "$HAVE_WT" -eq 1 ]; then
  choice="$(wt --title "$TITLE" --menu "Create a container running Outpost: offline library, maps, mesh messages and your home server HQ.\n\nRecommended: $CORES cores, $((MEMORY / 1024)) GB RAM, $DISK GB disk on $STORAGE, DHCP, $CHANNEL updates." 18 72 2 \
    default "Use the recommended settings" \
    advanced "Choose each setting")" || cancelled
  [ "$choice" = advanced ] && advanced
elif [ "$YES" -eq 0 ] && [ "$HAVE_WT" -eq 0 ]; then
  warn "No menu available here (whiptail missing or not a terminal). Using the settings from the command line."
fi

# --- Check the settings -----------------------------------------------------------
num() { [[ "$2" =~ ^[0-9]+$ ]] || die "$1 must be a number (got '$2')."; }
num "Container ID" "$CTID"; num "Cores" "$CORES"; num "Memory" "$MEMORY"; num "Disk" "$DISK"
[ "$CTID" -ge 100 ] || die "Container IDs start at 100."
pct status "$CTID" >/dev/null 2>&1 && die "CT $CTID already exists. Pick another ID, or update it with --update $CTID."
[ -n "$VLAN" ] && num "VLAN" "$VLAN"
case "$CHANNEL" in nightly|beta|stable) ;; *) die "Channel must be nightly, beta or stable." ;; esac
[[ "$CT_HOSTNAME" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$ ]] || die "Hostname '$CT_HOSTNAME' isn't valid."
ip link show "$BRIDGE" >/dev/null 2>&1 || die "There's no network bridge called $BRIDGE on this host."
if [ "$IP" != dhcp ]; then
  [[ "$IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$ ]] || die "Static IP must look like 192.168.1.50/24."
  [ -n "$GATEWAY" ] || die "A static IP needs a gateway (--gateway)."
fi
[ -z "$SSH_KEY" ] || [ -f "$SSH_KEY" ] || die "SSH key file $SSH_KEY doesn't exist."

[ "$CORES" -lt 2 ] && warn "Fewer than 2 cores makes updates slow: each one builds a new image."
[ "$MEMORY" -lt 2048 ] && warn "Less than 2 GB of RAM can make the image build fail."
[ "$DISK" -lt 128 ] && warn "$DISK GB fits Wikipedia without pictures (~50 GB) but not with them (~110 GB)."

FREE="$(free_gb "$STORAGE")"
[ -n "$FREE" ] || die "Storage '$STORAGE' isn't active or can't hold container disks."
if [ "$FREE" -lt "$DISK" ]; then
  msg="$STORAGE has $FREE GB free, less than the $DISK GB disk. Thin storage allows this, but the container will fail when the pool fills up."
  if [ "$YES" -eq 0 ] && [ "$HAVE_WT" -eq 1 ]; then
    wt --title "Not much space" --yesno "$msg\n\nCreate it anyway?" 12 70 || cancelled
  else
    warn "$msg"
  fi
fi

NET="name=eth0,bridge=$BRIDGE,ip=$IP"
[ "$IP" != dhcp ] && NET="$NET,gw=$GATEWAY"
[ -n "$VLAN" ] && NET="$NET,tag=$VLAN"

if [ "$YES" -eq 0 ] && [ "$HAVE_WT" -eq 1 ]; then
  wt --title "Ready to create" --yes-button "Create" --no-button "Cancel" --yesno \
"CT $CTID: $CT_HOSTNAME
CPU      $CORES cores
Memory   $MEMORY MB (+$SWAP MB swap)
Disk     $DISK GB on $STORAGE
Network  $BRIDGE, ${IP}${GATEWAY:+ via $GATEWAY}${VLAN:+, VLAN $VLAN}
Updates  $CHANNEL channel
Login    ${PASSWORD:+root password, }${SSH_KEY:+SSH keys, }pct enter $CTID

Unprivileged, with nesting for Docker, starting at boot." 19 64 || cancelled
  clear
fi

# --- Create ------------------------------------------------------------------------
say "Finding the newest Debian template"
pveam update >/dev/null 2>&1 || warn "Couldn't refresh the template list; using what's known."
TEMPLATE="$(pveam available --section system | awk '{print $2}' | grep -E '^debian-[0-9]+-standard_.*_amd64\.tar\.zst$' | sort -V | tail -n 1)"
[ -n "$TEMPLATE" ] || die "No Debian template is available from pveam."
if ! pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE"; then
  say "Downloading $TEMPLATE to $TEMPLATE_STORAGE"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
fi

say "Creating CT $CTID ($CT_HOSTNAME): $CORES cores, $MEMORY MB, $DISK GB on $STORAGE"
# shellcheck disable=SC2054  # "nesting=1,keyctl=1" is one comma-separated pct value
args=(
  --hostname "$CT_HOSTNAME"
  --cores "$CORES" --memory "$MEMORY" --swap "$SWAP"
  --rootfs "$STORAGE:$DISK"
  --net0 "$NET"
  --features nesting=1,keyctl=1
  --unprivileged 1 --onboot 1 --ostype debian
  --tags outpost
)
[ -n "$PASSWORD" ] && args+=(--password "$PASSWORD")
[ -n "$SSH_KEY" ] && args+=(--ssh-public-keys "$SSH_KEY")
pct create "$CTID" "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE" "${args[@]}"
pct start "$CTID"

say "Waiting for the network"
online=0
for _ in $(seq 1 45); do
  if in_ct "$CTID" "getent hosts github.com >/dev/null" 2>/dev/null; then online=1; break; fi
  sleep 2
done
[ "$online" -eq 1 ] || die "CT $CTID can't reach the internet. Check bridge $BRIDGE${IP:+ and the address $IP}. The container was kept: pct destroy $CTID to remove it."

say "Installing Outpost ($CHANNEL channel). The first build takes a few minutes."
in_ct "$CTID" "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl git ca-certificates cron >/dev/null"
in_ct "$CTID" "curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | OUTPOST_DIR=$APP_DIR bash -s -- --yes --channel $CHANNEL"

# A short command inside the container: outpost-update, outpost-update --rollback, …
in_ct "$CTID" "printf '#!/bin/sh\nexec bash $APP_DIR/install.sh \"\$@\"\n' > /usr/local/bin/outpost-update && chmod +x /usr/local/bin/outpost-update"

ADDRESS="$(in_ct "$CTID" "hostname -I | awk '{print \$1}'")"
PORT="$(in_ct "$CTID" "sed -n 's/^PORT=//p' $APP_DIR/.env" 2>/dev/null || echo 3000)"
URL="http://$ADDRESS:${PORT:-3000}"

# Notes in the container's Summary panel.
pct set "$CTID" --description "## Outpost
Off the grid, not out of touch.

**Open:** [$URL]($URL)

**Update:** Settings › Updates in Outpost, or on this host:
\`bash proxmox-lxc.sh --update $CTID\`

**Roll back:** \`bash proxmox-lxc.sh --rollback $CTID\`

Inside the container: \`outpost-update\` · code in \`$APP_DIR\`" >/dev/null

cat <<EOF

${G}${B}Outpost is running in CT $CTID:${N} $URL

  Update from this host:   bash proxmox-lxc.sh --update $CTID
  Roll back:               bash proxmox-lxc.sh --rollback $CTID
  Check it:                bash proxmox-lxc.sh --status $CTID
  Or use Settings > Updates in Outpost itself.

EOF
