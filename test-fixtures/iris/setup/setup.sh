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
