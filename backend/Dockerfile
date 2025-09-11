FROM debian:12-slim

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install essential packages, including Python, pip, git, and Java
RUN apt-get update && \
    apt-get install -y  --no-install-recommends python3.11 python3-pip python3-venv git openjdk-17-jre-headless pipx poppler-utils zip musescore3 curl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean

# Install some python packages globally using pipx
RUN pipx ensurepath
RUN pipx install poetry
RUN pipx install --include-deps music21

# setup pythons and tool path for scripts
RUN ln -s /usr/bin/python3.11 /usr/bin/python
RUN ln -s /root/.local/bin/poetry  /usr/bin/poetry

# An awesome Optical Music Recognition software
RUN git clone https://github.com/liebharc/homr.git &&  \
    cd homr &&  \
    poetry install --without dev && \
    poetry run homr --init
# merge multiple musicxml files into one
RUN git clone https://github.com/piano-ml/relieur
# guess fingerings from a musicxml file
RUN git clone https://github.com/marcomusy/pianoplayer.git

# Copy the backend jar file into the container
COPY target/backend.jar target/backend.jar

# Copy scripts folder into the container
COPY scripts/ scripts/

# Expose the application port
EXPOSE 8080

# Set default JVM options as environment variable
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:InitialRAMPercentage=50.0 -XX:+UseG1GC -XX:MaxGCPauseMillis=100 -XX:+UnlockExperimentalVMOptions -XX:+UseStringDeduplication -XX:+OptimizeStringConcat -Djava.security.egd=file:/dev/urandom -XX:+ExitOnOutOfMemoryError"
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar target/backend.jar \"$@\"", "--"]
