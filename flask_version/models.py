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

    def __init__(self, msg, user, ws):
        self.msg = msg
        self.user = user
        self.ws = ws
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
    folder = Column(Integer, default=0)
    running = Column(Boolean, default=False)

    def __init__(self, ws_num, name, owner_id=None):
        self.ws_num = ws_num
        self.name = name
        if not owner_id is None:
            self.owner_id = owner_id

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

    def __init__(self, hrz, nickname=None):
        self.hrz = hrz
        if nickname is None:
            self.nickname = hrz
        else:
            self.nickname = nickname

def getUserbyHRZ(db, hrz_name):
    return db.query(User).filter_by(hrz=hrz_name).one()

def newDBWorksheet(db, W):
    ws = Worksheet(W.id_number(), W.name())
    ws.owner = getUserbyHRZ(db, W.owner_from_filename())
    db.add(ws)

def getDBWorksheet(db, W):
    ws_user_db = getUserbyHRZ(db, W.owner_from_filename())
    ws_num = W.id_number()
    return db.query(Worksheet).filter_by(owner_id=ws_user_db.id, ws_num=ws_num).one()

def getDBWorksheetByFilename(db, filename):
    owner, ws_num = filename.split("/")
    ws_user_db = getUserbyHRZ(db, owner)
    return db.query(Worksheet).filter_by(owner_id=ws_user_db.id, ws_num=ws_num).one()
