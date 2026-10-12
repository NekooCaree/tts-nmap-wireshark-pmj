FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive DISPLAY=:1 HOME=/home/student
RUN echo 'wireshark-common wireshark-common/install-setuid boolean false' | debconf-set-selections \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       xvfb x11-utils x11vnc openbox tint2 xterm dbus-x11 novnc websockify \
       nmap wireshark tshark firefox-esr curl iputils-ping dnsutils iproute2 \
       libcap2-bin fonts-dejavu ca-certificates python3 \
    && groupadd -g 10001 student \
    && useradd -m -u 10001 -g student -s /bin/bash student \
    && (getent group wireshark || groupadd wireshark) \
    && usermod -aG wireshark student \
    && chgrp wireshark /usr/bin/dumpcap && chmod 750 /usr/bin/dumpcap \
    && setcap cap_net_raw,cap_net_admin=eip /usr/bin/dumpcap \
    && mkdir -p /home/student/lab-files /home/student/.config/openbox \
    && chown -R student:student /home/student \
    && rm -rf /var/lib/apt/lists/*
COPY entrypoint.py healthcheck.py welcome.txt /opt/desktop/
COPY menu.xml /home/student/.config/openbox/menu.xml
COPY firefox.js /etc/firefox-esr/defaults/pref/lab.js
RUN chown student:student /home/student/.config/openbox/menu.xml
USER student
EXPOSE 6080
CMD ["python3", "/opt/desktop/entrypoint.py"]
