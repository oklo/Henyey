C     ONE NEWTON RELAXATION STEP FOR A TRIDIAGONAL HENYEY BLOCK
      PROGRAM HENYEY
      INTEGER N
      REAL A(5),B(5),C(5),R(5),DX(5)
      DATA N/5/
      DATA A/0.0,-1.0,-1.0,-1.0,-1.0/
      DATA B/2.0,2.0,2.0,2.0,2.0/
      DATA C/-1.0,-1.0,-1.0,-1.0,0.0/
      DATA R/0.0,0.0,0.0,0.0,6.0/
      CALL RELAX(N,A,B,C,R,DX)
      WRITE(6,100) (DX(I),I=1,N)
  100 FORMAT(1H ,5F12.6)
      STOP
      END
C
      SUBROUTINE RELAX(N,A,B,C,R,X)
      INTEGER N,I
      REAL A(N),B(N),C(N),R(N),X(N),CP(5),DP(5),DEN
      CP(1)=C(1)/B(1)
      DP(1)=R(1)/B(1)
      DO 10 I=2,N
      DEN=B(I)-A(I)*CP(I-1)
      CP(I)=C(I)/DEN
      DP(I)=(R(I)-A(I)*DP(I-1))/DEN
   10 CONTINUE
      X(N)=DP(N)
      DO 20 I=N-1,1,-1
      X(I)=DP(I)-CP(I)*X(I+1)
   20 CONTINUE
      RETURN
      END
