"""Nightly summarizer job. Written in early 2024 and untouched since —
exactly the kind of code a model retirement breaks at 3am."""
from openai import OpenAI

client = OpenAI()


def summarize(text: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4-32k",
        temperature=0.4,
        max_tokens=512,
        messages=[{"role": "user", "content": text}],
    )
    return response.choices[0].message.content


def classify(text: str) -> str:
    response = client.chat.completions.create(
        model="o1-mini",
        temperature=0.0,
        max_tokens=64,
        messages=[{"role": "user", "content": f"Classify: {text}"}],
    )
    return response.choices[0].message.content
