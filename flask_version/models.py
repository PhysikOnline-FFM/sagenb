from sqlalchemy import Table, Column, Integer, ForeignKey, DateTime, Text, String, Boolean
from sqlalchemy.orm import relationship, backref
from sqlalchemy.ext.declarative import declarative_base
import datetime
#from sqlalchemy.dialects.postgresql import *

Base = declarative_base()

class Chatlog_entry(Base):
    __tablename__ = 'chatlog'

    id = Column(Integer, primary_key=True)
    wsid = Column(Integer, ForeignKey('worksheets.id'))
    ws = relationship("Worksheet")
    uid = Column(Integer, ForeignKey('users.id'))
    user = relationship("User")
    time = Column(DateTime)
    msg = Column(Text)

    def __init__(self, msg):
        self.msg = msg
        self.time = datetime.datetime.now()

    def __repr__(self):
        return '<time {}>'.format(self.time)

association_table = Table('tagging', Base.metadata,
        Column('wsid', Integer, ForeignKey('worksheets.id')),
        Column('tagid', Integer, ForeignKey('tags.id'))
        )

class Worksheet(Base):
    __tablename__ = 'worksheets'

    id = Column(Integer, primary_key=True)
    ws_num = Column(Integer)
    chatlog_entries = relationship("Chatlog_entry", backref="worksheets")
    name = Column(Text)
    owner_id = Column(Integer, ForeignKey('users.id'))
    owner = relationship("User")

    public_id = Column(String(20))
    continue_computation = Column(Boolean)

    def __init__(self, ws_num, name, public_id, continue_computation):
        self.ws_num = ws_num
        self.name = name
        self.public_id = public_id
        self.continue_computation = continue_computation

class Tag(Base):
    __tablename__ = 'tags'

    id = Column(Integer, primary_key=True)
    name = Column(String(20))
    worksheets = relationship("Worksheet", secondary=association_table, backref="tags")

    def __init__(self, name):
        self.name = name

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True)
    hrz = Column(String(20))
    nickname = Column(String(10))

    def __init__(self, hrz, nickname):
        self.hrz = hrz
        self.nickname = nickname
