#!/bin/sh
# Run by the nginx image at start: the password file from the environment.
#   OLOMOL_PASSWORD        the password (or OLOMOL_PASSWORD_FILE: a file holding it,
#                          e.g. a Docker secret)
#   OLOMOL_USER            the user name (default: olomol)
#   OLOMOL_NO_PASSWORD=1   no password at all (the site open to everyone who reaches it)
# Without a password and without OLOMOL_NO_PASSWORD=1 the container does not start.
set -eu
file=/etc/nginx/olomol.htpasswd
if [ -n "${OLOMOL_PASSWORD_FILE:-}" ]; then
  OLOMOL_PASSWORD=$(cat "$OLOMOL_PASSWORD_FILE")
fi
if [ -n "${OLOMOL_PASSWORD:-}" ]; then
  # SHA-512 crypt, which nginx checks with the system's crypt()
  printf '%s:%s\n' "${OLOMOL_USER:-olomol}" "$(mkpasswd -m sha512 "$OLOMOL_PASSWORD")" > "$file"
  chmod 644 "$file"
  echo "olomol: password required (user ${OLOMOL_USER:-olomol})"
elif [ "${OLOMOL_NO_PASSWORD:-}" = 1 ]; then
  sed -i 's/^\(\s*auth_basic\)/# \1/' /etc/nginx/conf.d/default.conf
  echo "olomol: no password (OLOMOL_NO_PASSWORD=1)"
else
  echo "olomol: set OLOMOL_PASSWORD (or OLOMOL_NO_PASSWORD=1 for an open site); not starting" >&2
  exit 1
fi
