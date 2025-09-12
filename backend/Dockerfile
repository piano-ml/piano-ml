FROM debian:12-slim

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install essential packages, including Python, pip, git, and Java
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3.11 \
        python3-pip \
        python3-venv \
        git \
        openjdk-17-jre-headless \
        poppler-utils \
        zip \
        musescore3 \
        curl \
        ca-certificates \
        sudo && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean

# Create a non-root user
RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser && \
    echo 'appuser ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Set up Python symlink
RUN ln -s /usr/bin/python3.11 /usr/bin/python

# Switch to non-root user
USER appuser
WORKDIR /home/appuser

# Install Poetry in user space
RUN pip3 install --user poetry && \
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
ENV PATH="/home/appuser/.local/bin:$PATH"

# Clone and install HOMR (Optical Music Recognition)
RUN git clone https://github.com/liebharc/homr.git && \
    cd homr && \
    poetry install --without dev && \
    poetry run homr --init

# Clone and install relieur (MusicXML merger)
RUN git clone https://github.com/piano-ml/relieur.git && \
    cd relieur && \
    poetry install

# Clone and install pianoplayer (fingering detection)
RUN git clone https://github.com/marcomusy/pianoplayer.git && \
    cd pianoplayer && \
    python -m venv venv && \
    ./venv/bin/pip install -r requirements.txt && \
    ./venv/bin/pip install -e .

# Create wrapper scripts for easy access to Python tools
RUN mkdir -p /home/appuser/bin && \
    echo '#!/bin/bash\ncd /home/appuser/homr && poetry run python -m homr "$@"' > /home/appuser/bin/homr && \
    echo '#!/bin/bash\ncd /home/appuser/relieur && poetry run python -m relieur.relieur "$@"' > /home/appuser/bin/relieur && \
    echo '#!/bin/bash\ncd /home/appuser/pianoplayer && ./venv/bin/python -m pianoplayer "$@"' > /home/appuser/bin/pianoplayer && \
    chmod +x /home/appuser/bin/*

ENV PATH="/home/appuser/bin:$PATH"

# Copy the backend jar file into the container
COPY --chown=appuser:appuser target/backend.jar /home/appuser/target/backend.jar

# Copy scripts folder into the container
COPY --chown=appuser:appuser scripts/ /home/appuser/scripts/

# Expose the application port
EXPOSE 8080

# Set default JVM options as environment variable
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:InitialRAMPercentage=50.0 -XX:+UseG1GC -XX:MaxGCPauseMillis=100 -XX:+UnlockExperimentalVMOptions -XX:+UseStringDeduplication -XX:+OptimizeStringConcat -Djava.security.egd=file:/dev/urandom -XX:+ExitOnOutOfMemoryError"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /home/appuser/target/backend.jar \"$@\"", "--"]
