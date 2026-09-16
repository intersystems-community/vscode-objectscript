#!/bin/sh
# Runs inside each container once IRIS is up (docker-compose.yml passes it to iris-main via -a).
# Un-expires the predefined passwords, gives /api/atelier a 10-second session timeout, and sets its
# authentication: password only by default, unauthenticated only with "anonymous" as the argument.
# Finally drops the marker file the compose healthcheck waits for.
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
