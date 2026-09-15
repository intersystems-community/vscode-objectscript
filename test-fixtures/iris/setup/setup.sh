#!/bin/sh
# Runs inside the container after IRIS starts (see docker-compose.yml).
# Configures the instance for the integration tests, then drops a marker file the healthcheck waits for.
# With "anonymous" as the argument, /api/atelier accepts only unauthenticated access; otherwise only passwords.
set -e
AUTHE=32
[ "$1" = anonymous ] && AUTHE=64

iris session IRIS -U %SYS <<EOF
// Predefined accounts keep their default password (SYS) but must not demand a change on first login
Write "UnExpire: ",##class(Security.Users).UnExpireUserPasswords("*"),!
Do ##class(Security.Applications).Get("/api/atelier",.a)
// Short session timeout so the tests can exercise expired-session recovery
Set a("Timeout")=10
Set a("AutheEnabled")=$AUTHE
Write "Web app: ",##class(Security.Applications).Modify("/api/atelier",.a),!
Halt
EOF

if [ "$1" = anonymous ]; then
	# Unauthenticated access also needs the web gateway service to allow it, and UnknownUser to hold privileges
	iris session IRIS -U %SYS <<'EOF'
Do ##class(Security.Services).Get("%Service_WebGateway",.s) Set s("AutheEnabled")=96 Write "Service: ",##class(Security.Services).Modify("%Service_WebGateway",.s),!
Do ##class(Security.Users).Get("UnknownUser",.u) Set u("Roles")="%All" Write "UnknownUser: ",##class(Security.Users).Modify("UnknownUser",.u),!
Halt
EOF
fi

touch /tmp/ci-setup-done
