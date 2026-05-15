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
        locales python3.11 python3-pip python3-venv pipx git openjdk-17-jre-headless \
        poppler-utils zip musescore3 curl ca-certificates sudo unzip && \
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

# --- Layer: heavy ML packages (cached separately, changes rarely) ---
# Use CPU-only PyTorch to save ~2 GB vs the full CUDA wheel
RUN python -m venv /home/appuser/shared-venv && \
    /home/appuser/shared-venv/bin/pip install --upgrade pip --no-cache-dir && \
    /home/appuser/shared-venv/bin/pip install --no-cache-dir \
        torch --index-url https://download.pytorch.org/whl/cpu && \
    /home/appuser/shared-venv/bin/pip install --no-cache-dir \
        transformers scikit-learn lightgbm safetensors

# --- Layer: lighter Python packages ---
RUN /home/appuser/shared-venv/bin/pip install --no-cache-dir \
        miditok music21 musicxml pretty_midi symusic matplotlib seaborn numpy

# install piano-syllabus-classifier
RUN git clone --depth=1 https://github.com/piano-ml/piano-syllabus-classifier.git && \
    rm -rf piano-syllabus-classifier/.git

# Install Poetry using pipx (recommended for Debian 12)
RUN pipx install poetry && \
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
ENV PATH="/home/appuser/.local/bin:$PATH"

# Clone and install HOMR (Optical Music Recognition)
# Note: --depth=1 cannot be used here because we need to checkout a specific commit hash
RUN git config --global user.email "you@example.com" && \
    git config --global user.name "Your Name" && \
    git clone https://github.com/liebharc/homr.git && \
    cd homr && \
    git fetch --tags && \
    git checkout ddfc632a75bf9c266e1a54c8b36c8383d3e83f43 && \
    poetry install --only main && \
    poetry run python -c "from homr.main import main; import sys; sys.argv = ['homr', '--init']; main()" && \
    rm -rf /home/appuser/homr/.git

# Clone and install relieur (MusicXML merger)
RUN git clone --depth=1 https://github.com/piano-ml/relieur.git && \
    cd relieur && \
    poetry install && \
    rm -rf /home/appuser/relieur/.git

# Clone pianoplayer (will use shared venv instead of its own)
RUN git clone --depth=1 https://github.com/marcomusy/pianoplayer.git && \
    cd pianoplayer && \
    pip3 install --no-cache-dir --break-system-package pianoplayer && \
    rm -rf /home/appuser/pianoplayer/.git

# Clone autoharmonizer2
RUN git clone --depth=1 https://github.com/piano-ml/autoharmonizer.git && \
    cd autoharmonizer && \
    . /home/appuser/shared-venv/bin/activate && \
    pip install --no-cache-dir -r requirements.txt && \
    rm -rf /home/appuser/autoharmonizer/.git

# Copy the backend jar file into the container
COPY --chown=appuser:appuser target/backend.jar /home/appuser/target/backend.jar

# Copy scripts folder into the container
COPY --chown=appuser:appuser scripts/ /home/appuser/scripts/

# Expose the application port
EXPOSE 8080

# Set default JVM options as environment variable
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:InitialRAMPercentage=50.0 -XX:+UseG1GC -XX:MaxGCPauseMillis=100 -XX:+UnlockExperimentalVMOptions -XX:+UseStringDeduplication -XX:+OptimizeStringConcat -Djava.security.egd=file:/dev/urandom -XX:+ExitOnOutOfMemoryError"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /home/appuser/target/backend.jar \"$@\"", "--"]
