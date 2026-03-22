FROM debian:12-slim

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Ensure container uses UTF-8 locales by default
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV PYTHONUTF8=1
ENV JAVA_TOOL_OPTIONS="-Dfile.encoding=UTF-8"

# Install essential packages, including locales for UTF-8 support
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        locales vim joe python3.11 python3-pip python3-venv pipx git openjdk-17-jre-headless \
        poppler-utils zip musescore3 curl ca-certificates sudo && \
    sed -i 's/^# *\(en_US.UTF-8 UTF-8\)/\1/' /etc/locale.gen || true && \
    sed -i 's/^# *\(fr_FR.UTF-8 UTF-8\)/\1/' /etc/locale.gen || true && \
    locale-gen en_US.UTF-8 fr_FR.UTF-8 || true && \
    update-locale LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 && \
    rm -rf /var/lib/apt/lists/* && apt-get clean

# Create a non-root user
RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser && \
    echo 'appuser ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Set up Python symlink
RUN ln -s /usr/bin/python3.11 /usr/bin/python

# Switch to non-root user
USER appuser
WORKDIR /home/appuser

# Create a global shared virtual environment for common Python packages
RUN python -m venv /home/appuser/shared-venv && \
    /home/appuser/shared-venv/bin/pip install --upgrade pip && \
    /home/appuser/shared-venv/bin/pip install music21 musicxml pretty_midi

# Install Poetry using pipx (recommended for Debian 12)
RUN pipx install poetry && \
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
ENV PATH="/home/appuser/.local/bin:$PATH"

# Clone and install HOMR (Optical Music Recognition)
RUN git config --global user.email "you@example.com" &&  \
    git config --global user.name "Your Name" && \
    git clone https://github.com/piano-ml/homr.git &&  \
    cd homr && \
    git fetch --tags && \
    git checkout 885073c && \
    git cherry-pick 2b274aa15dc08836d308ac9020f5d98a45cddf88 && \
    poetry install --without dev && \
    poetry run python -c "from homr.main import main; import sys; sys.argv = ['homr', '--init']; main()"

# Clone and install relieur (MusicXML merger)
RUN git clone https://github.com/piano-ml/relieur.git && \
    cd relieur && \
    poetry install

# Clone pianoplayer (will use shared venv instead of its own)
RUN pipx install pianoplayer


# Clone autoharmonizer2
RUN git clone https://github.com/piano-ml/autoharmonizer.git && \
    cd autoharmonizer && \
    . /home/appuser/shared-venv/bin/activate && \
    pip install -r requirements.txt

# Copy the backend jar file into the container
COPY --chown=appuser:appuser target/backend.jar /home/appuser/target/backend.jar

# Copy scripts folder into the container
COPY --chown=appuser:appuser scripts/ /home/appuser/scripts/
COPY --chown=appuser:appuser src/test/resources/samples/* /home/appuser/samples/
# Expose the application port
EXPOSE 8080

# Set default JVM options as environment variable
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:InitialRAMPercentage=50.0 -XX:+UseG1GC -XX:MaxGCPauseMillis=100 -XX:+UnlockExperimentalVMOptions -XX:+UseStringDeduplication -XX:+OptimizeStringConcat -Djava.security.egd=file:/dev/urandom -XX:+ExitOnOutOfMemoryError"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /home/appuser/target/backend.jar \"$@\"", "--"]
