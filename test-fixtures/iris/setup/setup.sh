#!/bin/sh
# Runs inside the container after IRIS starts; "anonymous" makes /api/atelier unauthenticated-only
set -e
AUTHE=32
[ "$1" = anonymous ] && AUTHE=64

iris session IRIS -U %SYS <<EOF
// Otherwise _SYSTEM must change its password on first login
Write "UnExpire: ",##class(Security.Users).UnExpireUserPasswords("*"),!
Do ##class(Security.Applications).Get("/api/atelier",.a)
Set a("Timeout")=10
Set a("AutheEnabled")=$AUTHE
Write "Web app: ",##class(Security.Applications).Modify("/api/atelier",.a),!
Halt
EOF

if [ "$1" = anonymous ]; then
	# The web gateway service must allow unauthenticated access too, and UnknownUser needs privileges
	iris session IRIS -U %SYS <<'EOF'
Do ##class(Security.Services).Get("%Service_WebGateway",.s) Set s("AutheEnabled")=96 Write "Service: ",##class(Security.Services).Modify("%Service_WebGateway",.s),!
Do ##class(Security.Users).Get("UnknownUser",.u) Set u("Roles")="%All" Write "UnknownUser: ",##class(Security.Users).Modify("UnknownUser",.u),!
Halt
EOF
fi

touch /tmp/ci-setup-done
