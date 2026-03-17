from setuptools import setup, find_packages


with open("README.md", encoding="utf-8") as f:
    long_description = f.read()


setup(
    name="toolhub-sdk",
    version="1.0.0",
    description="ToolHub SDK — AI Tool Discovery, Invocation & Credential Injection",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="ToolHub",
    python_requires=">=3.8",
    packages=find_packages(),
    install_requires=["requests>=2.31.0", "pyjwt>=2.8.0"],
    extras_require={
        "langchain": ["langchain>=0.1.0"],
        "openai":    ["openai>=1.0.0"],
    },
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
    ],
)
