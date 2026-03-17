"""
数据库模型基类
==============
定义所有数据库模型的公共基类和混入类。

1. Base：SQLAlchemy 声明式基类，所有模型类都继承自它
2. TimestampMixin：时间戳混入类，为模型自动添加创建时间和更新时间字段

什么是混入类（Mixin）？
- 一种通过多重继承实现代码复用的模式
- 不能单独使用，只能"混入"到其他类中
- 这里的 TimestampMixin 让每个模型类自动拥有 created_at 和 updated_at 字段
"""

from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, Integer, DateTime
from datetime import datetime, timezone, timedelta

# SQLAlchemy 声明式基类
# 所有数据库模型都继承自 Base，SQLAlchemy 通过它追踪所有模型类
Base = declarative_base()

# 定义东八区时区
BEIJING_TZ = timezone(timedelta(hours=8))


class TimestampMixin:
    """
    时间戳混入类

    为继承此类的模型自动添加：
    - created_at：记录创建时间，在插入时自动设置为当前 UTC 时间
    - updated_at：记录更新时间，在插入和每次更新时自动设置为当前 UTC 时间
    """

    created_at = Column(DateTime, default=lambda: datetime.now(BEIJING_TZ))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(BEIJING_TZ),
        onupdate=lambda: datetime.now(BEIJING_TZ),
    )
