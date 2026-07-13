import os
from dotenv import load_dotenv
from openai import OpenAI
from typing import List, Optional

# pip install openai
# Set your API key: export OPENAI_API_KEY="sk-..."

load_dotenv()

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

MODEL = "gpt-4o-mini"


def call_llm(system_prompt: str, user_message: str) -> str:
    """
    Standard text call — used for most RAG compliance report responses.
    """
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
    )
    return response.choices[0].message.content


def call_llm_with_history(system_prompt: str, messages: List[dict]) -> str:
    """
    Multi-turn version — pass the full conversation history from the group chat.
    Each message should be {"role": "user"/"assistant", "content": "..."}
    """
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": system_prompt},
            *messages
        ]
    )
    return response.choices[0].message.content


def call_llm_with_image(
    system_prompt: str,
    user_message: str,
    messages: List[dict],
    image_base64: str,
    mime_type: str = "image/jpeg"
) -> str:
    """
    Vision call — used when a scout uploads a location photo to the chat.
    Sends the actual image to GPT-4o mini for real visual analysis.

    Args:
        system_prompt:  RAG-enhanced compliance system prompt
        user_message:   The user's text question about the location
        messages:       Prior conversation history
        image_base64:   Base64-encoded image string (already in this format from the frontend)
        mime_type:      "image/jpeg", "image/png", or "image/webp"
    """
    # Build the user turn: image first, then the text question
    user_content = [
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:{mime_type};base64,{image_base64}"
            }
        },
        {
            "type": "text",
            "text": user_message
        }
    ]

    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": system_prompt},
            *messages,
            {"role": "user", "content": user_content}
        ]
    )
    return response.choices[0].message.content
