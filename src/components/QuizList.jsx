import { useQuizStore } from '../store/quizStore';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Trash2, PlusCircle, Video } from 'lucide-react';

export default function QuizList() {
  const { quizzes, deleteQuiz } = useQuizStore();
  const navigate = useNavigate();

  return (
    <div className="list-container">
      <div className="list-header">
        <h1>Your Quizzes</h1>
        <Link to="/admin" className="btn btn-primary">
          <PlusCircle size={18} /> New Quiz
        </Link>
      </div>

      {quizzes.length === 0 ? (
        <div className="empty-state glass-panel">
          <Video size={48} className="text-muted" />
          <p>No quizzes created yet.</p>
          <Link to="/admin" className="btn btn-primary mt-4">Create your first quiz</Link>
        </div>
      ) : (
        <div className="quiz-grid">
          {quizzes.map((quiz, idx) => (
            <div key={quiz.id} className="quiz-card glass-panel">
              <div className="card-top">
                <span className="quiz-number">#{idx + 1}</span>
                {quiz.image && <div className="quiz-thumb" style={{ backgroundImage: `url(${quiz.image})` }} />}
              </div>
              <div className="card-content">
                <h3>{quiz.question}</h3>
                <p className="meta-text">{quiz.config.timerDuration}s Timer • {quiz.config.theme} theme</p>
                <div className="card-actions">
                  <button className="btn btn-primary btn-sm flex-1" onClick={() => navigate(`/play/${quiz.id}`)}>
                    <Play size={14} /> Play
                  </button>
                  <button className="btn btn-secondary btn-icon" onClick={() => navigate(`/edit/${quiz.id}`)} title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                  </button>
                  <button className="btn btn-danger btn-icon" onClick={() => deleteQuiz(quiz.id)} title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
