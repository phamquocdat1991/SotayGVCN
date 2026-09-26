import assert from 'node:assert/strict';
import test from 'node:test';
import { generateStudentComments, generateZaloMessage, generateMeetingPlan, generateEarlyWarning } from '../server_ai.mjs';

test('AI Gateway generates student comments with pedagogical fallback', async () => {
  const sampleStudents = [
    { id: 1, name: 'Nguyễn Văn An', points: 35, gender: 'Nam' },
    { id: 2, name: 'Trần Thị Bình', points: 15, gender: 'Nữ' },
    { id: 3, name: 'Lê Hoàng Cường', points: -5, gender: 'Nam' }
  ];

  const res = await generateStudentComments({
    students: sampleStudents,
    criteria: 'tt22',
    month: 'Tháng 10'
  });

  assert.equal(res.success, true);
  assert.ok(Array.isArray(res.comments));
  assert.equal(res.comments.length, 3);
  assert.match(res.comments[0].phamChat, /gương mẫu|kỷ luật/i);
  assert.equal(res.comments[0].xepLoaiGoiY, 'Tốt');
  assert.equal(res.comments[2].xepLoaiGoiY, 'Chưa đạt');
});

test('AI Gateway generates polite Zalo messages for parents', async () => {
  const res = await generateZaloMessage({
    student: { id: 1, name: 'Nguyễn Văn An', points: 25 },
    type: 'commend',
    className: '12A1',
    teacherName: 'Thầy Đạt'
  });

  assert.equal(res.success, true);
  assert.match(res.message, /Kính gửi Quý Phụ huynh em Nguyễn Văn An/);
  assert.match(res.message, /Thầy Đạt/);
});

test('AI Gateway generates structured 45-minute lesson plan for class meeting', async () => {
  const res = await generateMeetingPlan({
    week: 6,
    theme: 'An toàn giao thông và Tình bạn đẹp',
    className: '12A1',
    teacherName: 'Thầy Đạt',
    classStats: { totalStudents: 40, topGroup: 'Tổ 2' }
  });

  assert.equal(res.success, true);
  assert.match(res.plan, /TIẾT SINH HOẠT LỚP — TUẦN 6/);
  assert.match(res.plan, /AN TOÀN GIAO THÔNG/);
  assert.match(res.plan, /TIẾN TRÌNH CHI TIẾT/);
});

test('Early Warning System flags students with negative points or infractions', async () => {
  const students = [
    { id: 1, name: 'Em Tốt', points: 20 },
    { id: 2, name: 'Em Cần Nhắc', points: -3, unexcusedAbsences: 2 }
  ];

  const res = await generateEarlyWarning({ students });
  assert.equal(res.success, true);
  assert.equal(res.flagged.length, 1);
  assert.equal(res.flagged[0].name, 'Em Cần Nhắc');
  assert.ok(res.advice.length > 20);
});
