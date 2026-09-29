pipeline {
    agent {
        label 'dashboard-raspberry-pi'
    }

    stages {
        stage('Install Dependencies') {
            steps {
                sh '''#!/bin/bash
                    source $HOME/.nvm/nvm.sh
                    npm install
                '''
            }
        }

        stage('Configure Service Stop Timeout') {
            steps {
                sh '''
                    # Backstop: cap how long systemd waits for a clean stop before SIGKILL.
                    # Written as a drop-in so the unit file itself is left untouched.
                    DROPIN_DIR=/etc/systemd/system/dashboard-backend.service.d
                    DROPIN=$DROPIN_DIR/stop-timeout.conf
                    DESIRED=$(printf '[Service]\\nTimeoutStopSec=15\\n')

                    if [ "$(cat "$DROPIN" 2>/dev/null)" != "$DESIRED" ]; then
                        sudo mkdir -p "$DROPIN_DIR"
                        printf '%s\\n' "$DESIRED" | sudo tee "$DROPIN" > /dev/null
                        sudo systemctl daemon-reload
                        echo "Installed stop timeout drop-in"
                    fi
                '''
            }
        }

        stage('Stop Backend Service') {
            steps {
                sh 'sudo systemctl stop dashboard-backend.service'
            }
        }

        stage('Deploy backend files') {
            steps {
                sh '''
                    # --delete removes files that are gone from the repo; excluded paths are
                    # protected from deletion, which is what keeps .env on the Pi.
                    sudo rsync -a --delete --no-owner --no-group \\
                        --exclude /.git --exclude /.env --exclude /.env.local \\
                        ./ /home/host-rpi/dashboard-hm-sp/
                '''
            }
        }

        stage('Start Backend Service') {
            steps {
                sh 'sudo systemctl start dashboard-backend.service'
            }
        }

        stage('Verify Backend') {
            steps {
                sh '''
                    # Wait a few seconds for service to start
                    sleep 10

                    # Check if service is running
                    sudo systemctl is-active --quiet dashboard-backend.service && echo "Backend is running" || exit 1

                    # Optional: health check
                    curl -f http://localhost:3001/api/health || exit 1
                '''
            }
        }
    }

    post {
        success {
            echo 'Backend deployment successful! Service is running.'
        }
        failure {
            echo 'Backend deployment failed. Attempting to restart service...'
            sh 'sudo systemctl start dashboard-backend.service || true'
        }
    }
}
