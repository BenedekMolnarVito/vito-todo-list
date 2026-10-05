# VitoTodoList smoke-test Android env.
# Sourced by harness.py / cdp.py for adb + emulator. Override any var in your shell.

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

# Package id for VitoTodoList (namespace == appId: app.servimus.vitotodolist).
# Confirm on device: adb shell pm list packages | grep vitotodolist
export VITO_APP_ID="${VITO_APP_ID:-app.servimus.vitotodolist}"

# TYPESAFE_API_KEY: set in ~/.hermes/.env — never commit it.
# Harness sources it via jev.load_key(); you can also:
#   set -a; . ~/.hermes/.env; set +a   to export it before running.
