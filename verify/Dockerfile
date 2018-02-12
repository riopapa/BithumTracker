FROM node:8.9.4-slim

MAINTAINER KwonYoung Kim <kykim79@gmail.com>

ENV TZ Asia/Seoul

RUN echo "${TZ}" > /etc/timezone && dpkg-reconfigure -f noninteractive tzdata && mkdir -p /app

COPY package.json /app

RUN cd /app; npm install

WORKDIR /app

ADD . /app

RUN mkdir -p /app/config

VOLUME [ "/app/config", "/app/log" ]

CMD node verifyStability.js
