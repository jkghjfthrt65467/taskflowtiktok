#!/usr/bin/env python
# -*- coding: utf-8 -*-

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="order-processor",
    version="1.0.0",
    author="Your Name",
    author_email="your.email@example.com",
    description="Advanced order processing system with duplicate detection and filtering",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/order-processor",
    packages=find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.11",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
    python_requires=">=3.11",
    install_requires=[
        "Flask==2.3.3",
        "Flask-CORS==4.0.0",
        "requests==2.31.0",
        "psycopg2-binary==2.9.9",
        "python-dotenv==1.0.0",
        "gunicorn==21.2.0",
    ],
    entry_points={
        "console_scripts": [
            "order-processor=order_processor:main",
        ],
    },
)
