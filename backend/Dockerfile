# Use the latest Ubuntu LTS as a base image
FROM ubuntu:22.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install essential packages, including Python, pip, git, and Java
RUN apt-get update && \
    apt-get install -y python3.10 python3-pip git openjdk-17-jdk pipx poppler-utils zip musescore && \
    rm -rf /var/lib/apt/lists/*

# Install poetry
RUN pipx ensurepath
RUN pipx install poetry
RUN ln -s /root/.local/bin/poetry  /usr/bin/poetry

# Install music21
RUN pip3 install music21

 # Clone the homr repository and install its dependencies
RUN git clone https://github.com/liebharc/homr.git
WORKDIR homr
RUN poetry install

workdir /
RUN git clone https://github.com/papoteur-mga/relieur.git

RUN git clone https://github.com/marcomusy/pianoplayer.git


# Copy the Maven wrapper and the project's pom.xml
COPY target/backend.jar target/backend.jar

# Expose the application port
EXPOSE 8080

# Command to run the application
CMD ["java", "-jar", "target/backend.jar"]
